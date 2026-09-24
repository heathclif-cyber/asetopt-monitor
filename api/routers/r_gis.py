"""Authenticated GIS API. GIS data deliberately does not use generic REST routes."""
from __future__ import annotations

import json
import re
import csv
import zipfile
from datetime import datetime, timedelta, timezone
from io import BytesIO, StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any
from xml.etree import ElementTree as ET

import shapefile
from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from schemas_gis import (
    DatasetArchiveBody, DatasetCreateBody, DatasetUpdateBody, FeatureDraftPatchBody, GrantsBody,
    ImportMappingBody, PublishBody, RollbackBody,
)
from services.auth_deps import CurrentUser, require_admin, require_app_read
from services.gis.importer import GISImportError
from services.gis.permissions import DOMAIN_BY_KIND, domains_for_user, require_dataset_domain, require_domain
from services.gis.repository import (
    DETAIL_TABLES, apply_mapping, create_draft_version, dataset_row, refresh_import_readiness, report_hash, version_row, write_detail,
)
from services.gis.storage import GISStorageError, save_original, source_path


router = APIRouter(prefix="/api/gis", tags=["GIS"])

# Stable identity of one concession land asset: multipart KMZ polygons share
# Kebun + FID_Areal, and the value survives new GIS versions. aset_konsesi
# stores it to link optimised assets to the master concession.
KONSESI_KEY_SQL = "md5(concat_ws('|', coalesce(fv.original_properties->>'Kebun', fv.original_properties->>'kebun', ''), coalesce(fv.original_properties->>'FID_Areal', fv.original_properties->>'fid_areal', fv.original_properties->>'Nama_Serti', fv.name)))"

# Active version per concession layer; an unpublished layer falls back to its
# latest reviewable draft so the master list is usable before publication.
KONSESI_VERSION_CTE = """
  konsesi_version AS (
    SELECT d.id AS dataset_id,
      coalesce(d.active_version_id, (
        SELECT i.candidate_version_id FROM gis_imports i
        WHERE i.dataset_id=d.id AND i.state IN ('mapping_required', 'ready')
        ORDER BY i.created_at DESC LIMIT 1
      )) AS version_id,
      CASE WHEN d.active_version_id IS NULL THEN 'draf' ELSE 'terbit' END AS record_state
    FROM gis_datasets d WHERE d.kind='konsesi' AND d.archived_at IS NULL
  )"""


def _error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@router.get("/capabilities")
def capabilities(
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(require_app_read),
):
    return {
        "read": True,
        "domains": sorted(domains_for_user(db, user)),
        "formats": ["kml", "kmz", "geojson", "shapefile_zip", "gpkg"],
        "max_upload_bytes": 50 * 1024 * 1024,
        "drawing_enabled": False,
    }


@router.get("/datasets")
def list_datasets(
    kind: str | None = None,
    q: str | None = None,
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    filters = ["TRUE"] if include_archived else ["archived_at IS NULL"]
    params: dict[str, Any] = {"limit": limit}
    if kind:
        if kind not in DOMAIN_BY_KIND:
            raise HTTPException(status_code=422, detail="Jenis dataset tidak valid")
        filters.append("kind = :kind")
        params["kind"] = kind
    if q:
        filters.append("name ILIKE :q")
        params["q"] = f"%{q.strip()}%"
    rows = db.execute(text(f"""
      SELECT d.id, d.kind, d.name, d.scope_key, d.active_version_id, d.revision, d.archived_at, d.created_at,
        v.version_no AS active_version_no, v.source_name, v.source_year, v.published_at
      FROM gis_datasets d LEFT JOIN gis_dataset_versions v ON v.id = d.active_version_id
      WHERE {' AND '.join(filters)} ORDER BY d.created_at DESC LIMIT :limit
    """), params).mappings().all()
    return {"data": [dict(row) for row in rows]}


def _available_scope_key(db: Session, kind: str, name: str) -> str:
    """Derive a scope key from the layer name.

    gis_datasets enforces UNIQUE (kind, scope_key), so leaving the scope blank
    allows only one layer per kind — every later upload of that kind would be
    rejected with a 409.
    """
    base = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")[:120] or "layer"
    candidate, suffix = base, 2
    while db.execute(
        text("SELECT 1 FROM gis_datasets WHERE kind = :kind AND scope_key = :scope_key LIMIT 1"),
        {"kind": kind, "scope_key": candidate},
    ).first():
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


@router.post("/datasets", status_code=201)
def create_dataset(
    body: DatasetCreateBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    require_domain(db, user, body.kind)
    payload = body.model_dump()
    if not payload["scope_key"].strip():
        payload["scope_key"] = _available_scope_key(db, body.kind, body.name)
    try:
        row = db.execute(text("""
          INSERT INTO gis_datasets (kind, name, scope_key, created_by)
          VALUES (:kind, :name, :scope_key, :created_by) RETURNING *
        """), payload | {"created_by": user["id"]}).mappings().one()
        db.execute(text("""
          INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, details)
          VALUES (:actor_id, 'dataset_created', :dataset_id, CAST(:details AS jsonb))
        """), {"actor_id": user["id"], "dataset_id": row["id"], "details": json.dumps({"kind": body.kind})})
        db.commit()
        return {"dataset": dict(row)}
    except Exception as exc:
        db.rollback()
        if "gis_datasets_kind_scope_key_key" in str(exc):
            raise HTTPException(status_code=409, detail="Layer dengan jenis dan cakupan yang sama sudah ada. Pilih layer tujuan yang sudah ada, atau isi cakupan yang berbeda.") from None
        raise


@router.patch("/datasets/{dataset_id}")
def update_dataset(
    dataset_id: str,
    body: DatasetUpdateBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    dataset = require_dataset_domain(db, user, dataset_id)
    row = db.execute(text("""
      UPDATE gis_datasets SET name = :name, revision = revision + 1
      WHERE id = :id AND revision = :expected_revision RETURNING *
    """), {"id": dataset_id, **body.model_dump()}).mappings().first()
    if not row:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset telah berubah. Muat ulang data.")
    db.commit()
    return {"dataset": dict(row)}


@router.post("/datasets/{dataset_id}/archive")
def archive_dataset(
    dataset_id: str,
    body: DatasetArchiveBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    dataset = require_dataset_domain(db, user, dataset_id)
    if dataset["archived_at"]:
        raise HTTPException(status_code=409, detail="Layer sudah diarsipkan")
    row = db.execute(text("""
      UPDATE gis_datasets SET archived_at = now(), revision = revision + 1
      WHERE id = :id AND revision = :expected_revision RETURNING *
    """), {"id": dataset_id, **body.model_dump()}).mappings().first()
    if not row:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset telah berubah. Muat ulang data.")
    db.execute(text("""
      INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, details)
      VALUES (:actor_id, 'dataset_archived', :dataset_id, CAST(:details AS jsonb))
    """), {"actor_id": user["id"], "dataset_id": dataset_id, "details": json.dumps({"name": dataset["name"], "kind": dataset["kind"]})})
    db.commit()
    return {"dataset": dict(row)}


@router.post("/datasets/{dataset_id}/unarchive")
def unarchive_dataset(
    dataset_id: str,
    body: DatasetArchiveBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    dataset = require_dataset_domain(db, user, dataset_id)
    if not dataset["archived_at"]:
        raise HTTPException(status_code=409, detail="Layer belum diarsipkan")
    row = db.execute(text("""
      UPDATE gis_datasets SET archived_at = NULL, revision = revision + 1
      WHERE id = :id AND revision = :expected_revision RETURNING *
    """), {"id": dataset_id, **body.model_dump()}).mappings().first()
    if not row:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset telah berubah. Muat ulang data.")
    db.execute(text("""
      INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, details)
      VALUES (:actor_id, 'dataset_unarchived', :dataset_id, CAST(:details AS jsonb))
    """), {"actor_id": user["id"], "dataset_id": dataset_id, "details": json.dumps({"name": dataset["name"], "kind": dataset["kind"]})})
    db.commit()
    return {"dataset": dict(row)}


@router.delete("/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    expected_revision: int = Query(..., ge=0),
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    """Only a layer that was never published can be hard-deleted.

    Published feature versions are protected by a DB trigger (see migration
    032) that blocks DELETE once a gis_dataset_versions row is 'published' —
    that history must be archived, not erased. Datasets that are still
    draft/failed (e.g. an import whose source file was lost) have nothing to
    protect and can be removed outright.
    """
    dataset = require_dataset_domain(db, user, dataset_id)
    published = db.execute(text("""
      SELECT 1 FROM gis_dataset_versions WHERE dataset_id = :id AND state = 'published' LIMIT 1
    """), {"id": dataset_id}).first()
    if dataset["active_version_id"] is not None or published:
        raise HTTPException(status_code=409, detail="Layer memiliki versi terbitan dan tidak dapat dihapus. Arsipkan layer ini untuk menyembunyikannya tanpa kehilangan riwayat data.")
    if dataset["revision"] != expected_revision:
        raise HTTPException(status_code=409, detail="Dataset telah berubah. Muat ulang data.")
    db.execute(text("""
      INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, details)
      VALUES (:actor_id, 'dataset_deleted', :dataset_id, CAST(:details AS jsonb))
    """), {"actor_id": user["id"], "dataset_id": dataset_id, "details": json.dumps({"name": dataset["name"], "kind": dataset["kind"]})})
    # gis_source_files restricts deletion of its version, so it must go first;
    # everything else hangs off gis_datasets with ON DELETE CASCADE.
    db.execute(text("""
      DELETE FROM gis_source_files
      WHERE version_id IN (SELECT id FROM gis_dataset_versions WHERE dataset_id = :id)
    """), {"id": dataset_id})
    db.execute(text("DELETE FROM gis_datasets WHERE id = :id"), {"id": dataset_id})
    db.commit()
    return {"deleted": True}


@router.get("/datasets/{dataset_id}/versions")
def list_versions(
    dataset_id: str,
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    dataset_row(db, dataset_id)
    rows = db.execute(text("""
      SELECT id, version_no, state, source_name, source_url, source_year, effective_date,
        coverage_note, change_note, created_at, published_at
      FROM gis_dataset_versions WHERE dataset_id=:dataset_id ORDER BY version_no DESC
    """), {"dataset_id": dataset_id}).mappings().all()
    return {"data": [dict(row) for row in rows]}


@router.post("/datasets/{dataset_id}/edit-draft", status_code=201)
def begin_dataset_edit(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    """Copy published geometry and metadata into an editable draft version."""
    dataset = require_dataset_domain(db, user, dataset_id)
    if dataset["archived_at"]:
        raise HTTPException(status_code=409, detail="Pulihkan layer dari arsip sebelum mengedit")
    db.execute(text("SELECT id FROM gis_datasets WHERE id=:id FOR UPDATE"), {"id": dataset_id})
    pending = db.execute(text("""
      SELECT id FROM gis_imports WHERE dataset_id=:id AND state IN ('mapping_required', 'ready')
      ORDER BY created_at DESC LIMIT 1
    """), {"id": dataset_id}).scalar_one_or_none()
    if pending:
        db.execute(text("UPDATE gis_imports SET expires_at=now()+interval '30 days' WHERE id=:id"), {"id": pending})
        db.commit()
        return {"import_id": str(pending), "reused": True}
    if not dataset["active_version_id"]:
        raise HTTPException(status_code=409, detail="Layer belum memiliki versi terbit. Unggah berkas atau lanjutkan draf sebelumnya.")
    source = version_row(db, str(dataset["active_version_id"]))
    try:
        version = create_draft_version(db, dataset, user["id"])
        db.execute(text("""
          UPDATE gis_dataset_versions SET source_name=:source_name, source_url=:source_url,
            source_year=:source_year, effective_date=:effective_date,
            coverage_note=:coverage_note, change_note='Koreksi informasi poligon'
          WHERE id=:id
        """), {"id": version["id"], **{key: source[key] for key in ("source_name", "source_url", "source_year", "effective_date", "coverage_note")}})
        table = DETAIL_TABLES[dataset["kind"]]
        features = db.execute(text(f"""
          SELECT fv.id, fv.feature_id, to_jsonb(d) - 'feature_version_id' AS attributes
          FROM gis_feature_versions fv LEFT JOIN {table} d ON d.feature_version_id=fv.id
          WHERE fv.dataset_version_id=:version_id ORDER BY fv.id
        """), {"version_id": source["id"]}).mappings().all()
        for feature in features:
            new_id = db.execute(text("""
              INSERT INTO gis_feature_versions (dataset_version_id, feature_id, name, geom, original_properties, extra_attributes)
              SELECT :version_id, feature_id, name, geom, original_properties, extra_attributes
              FROM gis_feature_versions WHERE id=:old_id RETURNING id
            """), {"version_id": version["id"], "old_id": feature["id"]}).scalar_one()
            if feature["attributes"]:
                write_detail(db, dataset["kind"], str(new_id), feature["attributes"], user["id"])
            if dataset["kind"] == "konsesi":
                db.execute(text("""
                  INSERT INTO gis_konsesi_aset (konsesi_feature_version_id, aset_id, link_note, linked_by)
                  SELECT :new_id, aset_id, link_note, :actor_id FROM gis_konsesi_aset
                  WHERE konsesi_feature_version_id=:old_id
                """), {"new_id": new_id, "old_id": feature["id"], "actor_id": user["id"]})
        imp = db.execute(text("""
          INSERT INTO gis_imports (dataset_id, candidate_version_id, requested_by, state, expires_at)
          VALUES (:dataset_id, :version_id, :actor_id, 'mapping_required', now()+interval '30 days')
          RETURNING id
        """), {"dataset_id": dataset_id, "version_id": version["id"], "actor_id": user["id"]}).scalar_one()
        readiness = refresh_import_readiness(db, str(imp))
        db.execute(text("""
          INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, version_id, details)
          VALUES (:actor_id, 'version_edit_started', :dataset_id, :version_id, CAST(:details AS jsonb))
        """), {"actor_id": user["id"], "dataset_id": dataset_id, "version_id": version["id"],
               "details": json.dumps({"based_on_version_id": str(source["id"])})})
        db.commit()
        return {"import_id": str(imp), "reused": False, "state": readiness["state"]}
    except Exception:
        db.rollback()
        raise


@router.get("/datasets/{dataset_id}/export")
def export_dataset(
    dataset_id: str,
    format: str = Query(default="geojson", pattern="^(geojson|kml|shp)$"),
    version: str = Query(default="published", pattern="^(published|draft)$"),
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(require_app_read),
):
    dataset = dataset_row(db, dataset_id)
    if version == "draft":
        version_id = db.execute(text("""
          SELECT candidate_version_id FROM gis_imports WHERE dataset_id=:id
            AND state IN ('mapping_required', 'ready') ORDER BY created_at DESC LIMIT 1
        """), {"id": dataset_id}).scalar_one_or_none()
    else:
        version_id = dataset["active_version_id"]
    if not version_id:
        raise HTTPException(status_code=404, detail="Versi yang diminta belum tersedia")
    layer_version = version_row(db, str(version_id))
    table = DETAIL_TABLES[dataset["kind"]]
    rows = db.execute(text(f"""
      SELECT fv.name, fv.original_properties, fv.computed_area_m2,
        (coalesce(to_jsonb(d) - 'feature_version_id', '{{}}'::jsonb)
          || {"jsonb_strip_nulls(jsonb_build_object('nama_mitra', ks.nama_mitra, 'no_perjanjian', ks.no_perjanjian, 'skema_kerja_sama', ks.skema_kerja_sama, 'tanggal_mulai', ks.tgl_mulai, 'tanggal_berakhir', ks.tgl_selesai))" if dataset['kind'] == 'opset' else "'{}'::jsonb"}
          || fv.extra_attributes) AS attributes,
        ST_AsGeoJSON(fv.geom) AS geometry, ST_AsKML(fv.geom) AS kml
      FROM gis_feature_versions fv LEFT JOIN {table} d ON d.feature_version_id=fv.id
      {"LEFT JOIN kerja_sama ks ON ks.id=d.kerja_sama_id" if dataset['kind'] == 'opset' else ""}
      WHERE fv.dataset_version_id=:version_id ORDER BY fv.name
    """), {"version_id": version_id}).mappings().all()
    if not rows:
        raise HTTPException(status_code=404, detail="Versi ini belum berisi poligon")
    safe_name = re.sub(r"[^A-Za-z0-9_-]+", "-", dataset["name"]).strip("-")[:80] or "layer-gis"
    filename = f"{safe_name}-v{layer_version['version_no']}.{'zip' if format == 'shp' else format}"
    features = []
    for row in rows:
        properties = {"name": row["name"], "kind": dataset["kind"], "dataset_name": dataset["name"],
                      "computed_area_m2": float(row["computed_area_m2"])}
        properties.update({f"source_{key}": value for key, value in (row["original_properties"] or {}).items()})
        properties.update(row["attributes"] or {})
        features.append({"type": "Feature", "properties": properties, "geometry": json.loads(row["geometry"]), "kml": row["kml"]})
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    content = {"type": "FeatureCollection", "features": [{key: value for key, value in feature.items() if key != "kml"} for feature in features]}
    if format == "geojson":
        return Response(json.dumps(content, ensure_ascii=False, default=str), media_type="application/geo+json", headers=headers)
    if format == "shp":
        field_names = sorted({key for feature in features for key in feature["properties"]})
        aliases: dict[str, str] = {}
        used: set[str] = set()
        for key in field_names:
            base = re.sub(r"[^A-Za-z0-9_]", "_", key).upper()[:10] or "FIELD"
            alias = base
            suffix = 2
            while alias in used:
                tail = str(suffix)
                alias = f"{base[:10-len(tail)]}{tail}"
                suffix += 1
            aliases[key] = alias
            used.add(alias)
        with TemporaryDirectory() as directory:
            base_path = Path(directory) / safe_name
            writer = shapefile.Writer(str(base_path), shapeType=shapefile.POLYGON, encoding="utf-8")
            for alias in aliases.values():
                writer.field(alias, "C", size=254)
            for feature in features:
                writer.shape(feature["geometry"])
                writer.record(*[("" if feature["properties"].get(key) is None else str(feature["properties"][key]))[:254] for key in field_names])
            writer.close()
            base_path.with_suffix(".prj").write_text('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]')
            base_path.with_suffix(".cpg").write_text("UTF-8")
            field_map = StringIO()
            csv_writer = csv.writer(field_map)
            csv_writer.writerow(["kolom_shp", "nama_atribut_lengkap"])
            csv_writer.writerows((alias, key) for key, alias in aliases.items())
            archive = BytesIO()
            with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as zipped:
                for suffix in ("shp", "shx", "dbf", "prj", "cpg"):
                    zipped.write(base_path.with_suffix(f".{suffix}"), arcname=f"{safe_name}.{suffix}")
                zipped.writestr("field_map.csv", field_map.getvalue())
                zipped.writestr(f"{safe_name}.geojson", json.dumps(content, ensure_ascii=False, default=str))
        return Response(archive.getvalue(), media_type="application/zip", headers=headers)
    namespace = "http://www.opengis.net/kml/2.2"
    ET.register_namespace("", namespace)
    root = ET.Element(f"{{{namespace}}}kml")
    document = ET.SubElement(root, f"{{{namespace}}}Document")
    ET.SubElement(document, f"{{{namespace}}}name").text = dataset["name"]
    for feature in features:
        placemark = ET.SubElement(document, f"{{{namespace}}}Placemark")
        ET.SubElement(placemark, f"{{{namespace}}}name").text = str(feature["properties"]["name"])
        extended = ET.SubElement(placemark, f"{{{namespace}}}ExtendedData")
        for key, value in feature["properties"].items():
            if value is None or isinstance(value, (dict, list)):
                continue
            data = ET.SubElement(extended, f"{{{namespace}}}Data", name=str(key))
            ET.SubElement(data, f"{{{namespace}}}value").text = str(value)
        geometry = ET.fromstring(feature["kml"])
        for element in geometry.iter():
            element.tag = f"{{{namespace}}}{element.tag.split('}')[-1]}"
        placemark.append(geometry)
    return Response(ET.tostring(root, encoding="utf-8", xml_declaration=True), media_type="application/vnd.google-earth.kml+xml", headers=headers)


@router.get("/datasets/{dataset_id}/bounds")
def dataset_bounds(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(require_app_read),
):
    """Return the whole layer extent, independent of the map viewport."""
    dataset = dataset_row(db, dataset_id)
    row = db.execute(text("""
      SELECT ST_XMin(extent) AS west, ST_YMin(extent) AS south,
             ST_XMax(extent) AS east, ST_YMax(extent) AS north
      FROM (
        SELECT ST_Extent(fv.geom) AS extent
        FROM gis_feature_versions fv
        WHERE fv.dataset_version_id = COALESCE(
          :active_version_id,
          (SELECT v.id FROM gis_dataset_versions v
           WHERE v.dataset_id = :dataset_id AND v.state <> 'failed'
           ORDER BY v.version_no DESC LIMIT 1)
        )
      ) bounds
    """), {"dataset_id": dataset_id, "active_version_id": dataset["active_version_id"]}).mappings().one()
    if row["west"] is None:
        return {"bbox": None}
    return {"bbox": ",".join(str(row[key]) for key in ("west", "south", "east", "north"))}


@router.get("/assets/{aset_id}/bounds")
def asset_bounds(
    aset_id: str,
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Locate an asset through linked concession polygons or OPSET areas of its kerja sama."""
    row = db.execute(text("""
      WITH """ + KONSESI_VERSION_CTE + """, located AS (
        SELECT fv.geom, cv.dataset_id
        FROM konsesi_version cv
        JOIN gis_feature_versions fv ON fv.dataset_version_id=cv.version_id
        WHERE """ + KONSESI_KEY_SQL + """ IN (SELECT konsesi_key FROM aset_konsesi WHERE aset_id=CAST(:aset_id AS uuid))
        UNION ALL
        SELECT fv.geom, d.id AS dataset_id
        FROM gis_konsesi_aset ka
        JOIN gis_feature_versions fv ON fv.id=ka.konsesi_feature_version_id
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE ka.aset_id=CAST(:aset_id AS uuid) AND d.archived_at IS NULL
          AND (d.active_version_id=fv.dataset_version_id OR (d.active_version_id IS NULL AND EXISTS (
            SELECT 1 FROM gis_imports i WHERE i.candidate_version_id=fv.dataset_version_id AND i.state IN ('mapping_required', 'ready'))))
        UNION ALL
        SELECT fv.geom, d.id
        FROM gis_opset_details od
        JOIN gis_feature_versions fv ON fv.id=od.feature_version_id
        JOIN gis_datasets d ON d.active_version_id=fv.dataset_version_id
        JOIN kerja_sama ks ON ks.id=od.kerja_sama_id
        WHERE d.archived_at IS NULL AND (ks.aset_id=CAST(:aset_id AS uuid) OR EXISTS (
          SELECT 1 FROM kerja_sama_aset ksa WHERE ksa.ks_id=ks.id AND ksa.aset_id=CAST(:aset_id AS uuid)))
      )
      SELECT ST_XMin(extent) AS west, ST_YMin(extent) AS south, ST_XMax(extent) AS east, ST_YMax(extent) AS north,
        dataset_ids
      FROM (SELECT ST_Extent(geom) AS extent, array_agg(DISTINCT dataset_id::text) AS dataset_ids FROM located) bounds
    """), {"aset_id": aset_id}).mappings().one()
    if row["west"] is None:
        return {"bbox": None, "dataset_ids": []}
    return {"bbox": ",".join(str(row[key]) for key in ("west", "south", "east", "north")), "dataset_ids": row["dataset_ids"]}


@router.get("/datasets/{dataset_id}/imports/latest")
def latest_dataset_import(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(require_app_read),
):
    """Return an import a user can resume, preferring an active draft."""
    dataset = dataset_row(db, dataset_id)
    row = db.execute(text("""
      SELECT * FROM gis_imports WHERE dataset_id=:dataset_id
      ORDER BY CASE WHEN state IN ('uploaded', 'processing', 'mapping_required', 'ready') THEN 0 ELSE 1 END,
        created_at DESC LIMIT 1
    """), {"dataset_id": dataset["id"]}).mappings().first()
    return {"import": dict(row) if row else None}


@router.post("/datasets/{dataset_id}/imports", status_code=202)
async def create_import(
    dataset_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    dataset = require_dataset_domain(db, user, dataset_id)
    if dataset["archived_at"]:
        raise HTTPException(status_code=409, detail="Dataset telah diarsipkan")
    if idempotency_key:
        prior = db.execute(text("""
          SELECT result_id FROM gis_request_keys WHERE actor_id=:actor_id AND operation='create_import' AND idempotency_key=:key
        """), {"actor_id": user["id"], "key": idempotency_key}).scalar_one_or_none()
        if prior:
            return {"import_id": str(prior), "reused": True}
    try:
        version = create_draft_version(db, dataset, user["id"])
        saved = await save_original(file, str(version["id"]))
        db.execute(text("""
          INSERT INTO gis_source_files (version_id, original_name, storage_key, sha256, bytes, detected_format, uploaded_by)
          VALUES (:version_id, :original_name, :storage_key, :sha256, :bytes, :detected_format, :uploaded_by)
        """), saved | {"version_id": version["id"], "uploaded_by": user["id"]})
        imp = db.execute(text("""
          INSERT INTO gis_imports (dataset_id, candidate_version_id, requested_by)
          VALUES (:dataset_id, :candidate_version_id, :requested_by) RETURNING *
        """), {"dataset_id": dataset_id, "candidate_version_id": version["id"], "requested_by": user["id"]}).mappings().one()
        job = db.execute(text("""
          INSERT INTO gis_jobs (job_type, subject_id) VALUES ('import', :subject_id) RETURNING id
        """), {"subject_id": imp["id"]}).scalar_one()
        if idempotency_key:
            db.execute(text("""
              INSERT INTO gis_request_keys (actor_id, operation, idempotency_key, request_hash, result_id, response_status)
              VALUES (:actor_id, 'create_import', :key, :hash, :result_id, 202)
            """), {"actor_id": user["id"], "key": idempotency_key, "hash": saved["sha256"], "result_id": imp["id"]})
        db.commit()
        return {"import_id": str(imp["id"]), "job_id": str(job), "state": imp["state"]}
    except (GISStorageError, GISImportError) as exc:
        db.rollback()
        raise _error(exc) from None
    except Exception:
        db.rollback()
        raise


@router.get("/imports/{import_id}")
def get_import(
    import_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    row = db.execute(text("""
      SELECT i.*, d.kind, d.name AS dataset_name FROM gis_imports i
      JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id
    """), {"id": import_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Impor GIS tidak ditemukan")
    require_domain(db, user, row["kind"])
    return {"import": dict(row)}


@router.get("/imports/{import_id}/features")
def get_import_features(
    import_id: str,
    db: Session = Depends(get_db),
    user: dict[str, Any] = Depends(require_app_read),
):
    imp = db.execute(text("""
      SELECT i.*, d.kind FROM gis_imports i JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id
    """), {"id": import_id}).mappings().first()
    if not imp:
        raise HTTPException(status_code=404, detail="Impor GIS tidak ditemukan")
    table = {
        "konsesi": "gis_konsesi_details", "tanaman": "gis_tanaman_details", "hutan": "gis_hutan_details",
        "opset": "gis_opset_details", "okupasi": "gis_okupasi_details", "administrasi": "gis_administrasi_details",
    }[imp["kind"]]
    rows = db.execute(text(f"""
      SELECT fv.id, fv.name, fv.original_properties, fv.computed_area_m2,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(fv.geom, 0.00001)) AS geometry,
        (coalesce(to_jsonb(d) - 'feature_version_id', '{{}}'::jsonb)
          || {"jsonb_strip_nulls(jsonb_build_object('nama_mitra', ks.nama_mitra, 'no_perjanjian', ks.no_perjanjian, 'skema_kerja_sama', ks.skema_kerja_sama, 'tanggal_mulai', ks.tgl_mulai, 'tanggal_berakhir', ks.tgl_selesai))" if imp['kind'] == 'opset' else "'{}'::jsonb"}
          || fv.extra_attributes) AS attributes,
        {KONSESI_KEY_SQL if imp['kind'] == 'konsesi' else 'NULL'} AS konsesi_key,
        CASE WHEN :kind='konsesi' THEN coalesce((SELECT array_agg(ka.aset_id::text ORDER BY ka.aset_id::text) FROM gis_konsesi_aset ka WHERE ka.konsesi_feature_version_id=fv.id), ARRAY[]::text[]) ELSE ARRAY[]::text[] END AS linked_asset_ids
      FROM gis_feature_versions fv LEFT JOIN {table} d ON d.feature_version_id=fv.id
      {"LEFT JOIN kerja_sama ks ON ks.id=d.kerja_sama_id" if imp['kind'] == 'opset' else ""}
      WHERE fv.dataset_version_id=:version_id ORDER BY fv.name LIMIT 5000
    """), {"version_id": imp["candidate_version_id"], "kind": imp["kind"]}).mappings().all()
    return {"data": [{**dict(row), "id": str(row["id"]), "computed_area_m2": float(row["computed_area_m2"]), "geometry": json.loads(row["geometry"]),
                       "attributes": row["attributes"] or {}} for row in rows]}


@router.get("/reference/kerja-sama")
def list_kerja_sama_reference(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    rows = db.execute(text("""
      SELECT id, nama_mitra, no_perjanjian, skema_kerja_sama, tgl_mulai, tgl_selesai, status
      FROM kerja_sama ORDER BY nama_mitra LIMIT 500
    """)).mappings().all()
    return {"data": [{**dict(row), "id": str(row["id"])} for row in rows]}


@router.get("/reference/aset")
def list_aset_reference(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    rows = db.execute(text("""
      SELECT id, kode_aset, nama_aset FROM aset ORDER BY kode_aset LIMIT 1000
    """)).mappings().all()
    return {"data": [{**dict(row), "id": str(row["id"])} for row in rows]}


@router.get("/assets/summary")
def list_asset_summaries(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Return a non-overlapping spatial land-use summary for every asset.

    Totals are calculated from active published geometry.  Each thematic kind
    is unioned before it is intersected with a concession, so adjoining or
    overlapping KML polygons never inflate the hectares shown in the asset
    table.  The usable estimate subtracts all mapped use/restriction layers;
    it is intentionally labelled as an estimate until every layer is loaded.
    """
    rows = db.execute(text("""
      WITH linked_konsesi AS (
        SELECT ka.aset_id, fv.id AS feature_version_id, d.id AS dataset_id, fv.name, fv.geom
        FROM gis_konsesi_aset ka
        JOIN gis_feature_versions fv ON fv.id=ka.konsesi_feature_version_id
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE d.kind='konsesi' AND d.active_version_id=fv.dataset_version_id
      ), asset_geom AS (
        SELECT aset_id, ST_UnaryUnion(ST_Collect(geom)) AS geom,
          count(*)::integer AS konsesi_count,
          array_agg(DISTINCT name ORDER BY name) AS konsesi_names,
          array_agg(DISTINCT dataset_id::text ORDER BY dataset_id::text) AS dataset_ids,
          ST_Extent(geom)::box2d AS bounds
        FROM linked_konsesi GROUP BY aset_id
      ), category_geom AS (
        SELECT d.kind, ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM gis_feature_versions fv
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE d.active_version_id=fv.dataset_version_id
          AND d.kind IN ('tanaman', 'hutan', 'opset', 'okupasi')
        GROUP BY d.kind
      ), available_mask AS (
        SELECT ST_UnaryUnion(ST_Collect(geom)) AS geom
        FROM category_geom WHERE kind IN ('tanaman', 'hutan', 'opset', 'okupasi')
      )
      SELECT a.id, a.kode_aset, a.nama_aset,
        ag.konsesi_count, ag.konsesi_names, ag.dataset_ids,
        CASE WHEN ag.bounds IS NULL THEN NULL ELSE concat_ws(',', ST_XMin(ag.bounds::box3d), ST_YMin(ag.bounds::box3d), ST_XMax(ag.bounds::box3d), ST_YMax(ag.bounds::box3d)) END AS bbox,
        CASE WHEN ag.geom IS NULL THEN NULL ELSE round((ST_Area(ag.geom::geography) / 10000)::numeric, 4) END AS konsesi_area_ha,
        CASE WHEN ag.geom IS NULL THEN NULL ELSE round(coalesce((ST_Area(ST_Intersection(ag.geom, (SELECT geom FROM category_geom WHERE kind='tanaman'))::geography) / 10000), 0)::numeric, 4) END AS tanaman_area_ha,
        CASE WHEN ag.geom IS NULL THEN NULL ELSE round(coalesce((ST_Area(ST_Intersection(ag.geom, (SELECT geom FROM category_geom WHERE kind='hutan'))::geography) / 10000), 0)::numeric, 4) END AS hutan_area_ha,
        CASE WHEN ag.geom IS NULL THEN NULL ELSE round(coalesce((ST_Area(ST_Intersection(ag.geom, (SELECT geom FROM category_geom WHERE kind='okupasi'))::geography) / 10000), 0)::numeric, 4) END AS okupasi_area_ha,
        CASE WHEN ag.geom IS NULL THEN NULL ELSE round(coalesce((ST_Area(ST_Intersection(ag.geom, (SELECT geom FROM category_geom WHERE kind='opset'))::geography) / 10000), 0)::numeric, 4) END AS kerja_sama_area_ha,
        CASE WHEN ag.geom IS NULL THEN NULL ELSE round((ST_Area(ST_Difference(ag.geom, coalesce((SELECT geom FROM available_mask), ST_GeomFromText('MULTIPOLYGON EMPTY', 4326)))::geography) / 10000)::numeric, 4) END AS dapat_dimanfaatkan_area_ha
      FROM aset a LEFT JOIN asset_geom ag ON ag.aset_id=a.id
      ORDER BY a.kode_aset
    """)).mappings().all()
    active_kinds = set(db.execute(text("""
      SELECT DISTINCT kind FROM gis_datasets
      WHERE active_version_id IS NOT NULL AND archived_at IS NULL
    """)).scalars().all())
    required_kinds = {"konsesi", "tanaman", "hutan", "opset", "okupasi"}
    missing_layers = sorted(required_kinds - active_kinds)
    result = []
    for row in rows:
        item = dict(row)
        has_konsesi = item["konsesi_area_ha"] is not None
        item["id"] = str(item["id"])
        item["konsesi_names"] = item["konsesi_names"] or []
        item["dataset_ids"] = item["dataset_ids"] or []
        for field in ("konsesi_area_ha", "tanaman_area_ha", "hutan_area_ha", "okupasi_area_ha", "kerja_sama_area_ha", "dapat_dimanfaatkan_area_ha"):
            item[field] = float(item[field]) if item[field] is not None else None
        item["missing_layers"] = missing_layers if has_konsesi else ["konsesi"]
        item["analysis_status"] = (
            "belum ada konsesi terkait" if not has_konsesi
            else "estimasi — layer belum lengkap" if missing_layers
            else "estimasi berdasarkan layer aktif"
        )
        result.append(item)
    return {"data": result, "availability_note": "Sisa dapat dimanfaatkan adalah estimasi spasial: konsesi dikurangi gabungan unik tanaman, kawasan hutan, okupasi, dan area kerja sama. Konfirmasi legal tetap diperlukan."}


@router.get("/konsesi/summary")
def list_konsesi_summaries(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Summarise each active cadastral polygon, the authoritative asset source.

    A row is a polygon from the Regional 8 concession KMZ (or a replacement
    cadastral KML), never a row from the commercial kerja-sama master table.
    """
    rows = db.execute(text("""
      WITH konsesi_version AS (
        SELECT d.id AS dataset_id,
          coalesce(d.active_version_id, (
            SELECT i.candidate_version_id FROM gis_imports i
            WHERE i.dataset_id=d.id AND i.state IN ('mapping_required', 'ready')
            ORDER BY i.created_at DESC LIMIT 1
          )) AS version_id,
          CASE WHEN d.active_version_id IS NULL THEN 'draf' ELSE 'terbit' END AS record_state
        FROM gis_datasets d WHERE d.kind='konsesi' AND d.archived_at IS NULL
      ), category_geom AS (
        SELECT d.kind, ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM gis_feature_versions fv
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE d.active_version_id=fv.dataset_version_id
          AND d.kind IN ('tanaman', 'hutan', 'opset', 'okupasi')
        GROUP BY d.kind
      ), available_mask AS (
        SELECT ST_UnaryUnion(ST_Collect(geom)) AS geom
        FROM category_geom WHERE kind IN ('tanaman', 'hutan', 'opset', 'okupasi')
      )
      SELECT fv.id, cv.record_state, coalesce(kd.nomor_alas_hak, fv.name) AS kode_aset, fv.name AS nama_aset,
        coalesce(fv.original_properties->>'Kebun', fv.original_properties->>'kebun', '') AS lokasi,
        1::integer AS konsesi_count, ARRAY[fv.name]::text[] AS konsesi_names,
        ARRAY[d.id::text]::text[] AS dataset_ids,
        concat_ws(',', ST_XMin(Box2D(fv.geom)::box3d), ST_YMin(Box2D(fv.geom)::box3d), ST_XMax(Box2D(fv.geom)::box3d), ST_YMax(Box2D(fv.geom)::box3d)) AS bbox,
        round((ST_Area(fv.geom::geography) / 10000)::numeric, 4) AS konsesi_area_ha,
        round(coalesce((ST_Area(ST_Intersection(fv.geom, (SELECT geom FROM category_geom WHERE kind='tanaman'))::geography) / 10000), 0)::numeric, 4) AS tanaman_area_ha,
        round(coalesce((ST_Area(ST_Intersection(fv.geom, (SELECT geom FROM category_geom WHERE kind='hutan'))::geography) / 10000), 0)::numeric, 4) AS hutan_area_ha,
        round(coalesce((ST_Area(ST_Intersection(fv.geom, (SELECT geom FROM category_geom WHERE kind='okupasi'))::geography) / 10000), 0)::numeric, 4) AS okupasi_area_ha,
        round(coalesce((ST_Area(ST_Intersection(fv.geom, (SELECT geom FROM category_geom WHERE kind='opset'))::geography) / 10000), 0)::numeric, 4) AS kerja_sama_area_ha,
        round((ST_Area(ST_Difference(fv.geom, coalesce((SELECT geom FROM available_mask), ST_GeomFromText('MULTIPOLYGON EMPTY', 4326)))::geography) / 10000)::numeric, 4) AS dapat_dimanfaatkan_area_ha
      FROM konsesi_version cv
      JOIN gis_feature_versions fv ON fv.dataset_version_id=cv.version_id
      JOIN gis_datasets d ON d.id=cv.dataset_id
      LEFT JOIN gis_konsesi_details kd ON kd.feature_version_id=fv.id
      ORDER BY coalesce(fv.original_properties->>'Kebun', fv.original_properties->>'kebun', ''), fv.name
    """)).mappings().all()
    active_kinds = set(db.execute(text("""
      SELECT DISTINCT kind FROM gis_datasets
      WHERE active_version_id IS NOT NULL AND archived_at IS NULL
    """)).scalars().all())
    required_kinds = {"konsesi", "tanaman", "hutan", "opset", "okupasi"}
    missing_layers = sorted(required_kinds - active_kinds)
    result = []
    for row in rows:
        item = dict(row)
        item["id"] = str(item["id"])
        item["konsesi_names"] = item["konsesi_names"] or []
        item["dataset_ids"] = item["dataset_ids"] or []
        for field in ("konsesi_area_ha", "tanaman_area_ha", "hutan_area_ha", "okupasi_area_ha", "kerja_sama_area_ha", "dapat_dimanfaatkan_area_ha"):
            item[field] = float(item[field]) if item[field] is not None else None
        item["missing_layers"] = missing_layers
        item["analysis_status"] = (
            "draf — lengkapi informasi sebelum diterbitkan" if item["record_state"] == "draf"
            else "estimasi — layer belum lengkap" if missing_layers
            else "estimasi berdasarkan layer aktif"
        )
        result.append(item)
    return {"data": result, "availability_note": "Satu baris adalah satu polygon konsesi yang diterbitkan. Sisa dapat dimanfaatkan adalah estimasi spasial: konsesi dikurangi gabungan unik tanaman, kawasan hutan, okupasi, dan area kerja sama. Konfirmasi legal tetap diperlukan."}


@router.get("/konsesi/reference")
def list_konsesi_reference(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Light list of concession land assets for pickers and the master aset page.

    Unlike the grouped summary it skips land-use overlays, so it stays fast
    enough to load on every form that selects an asset.
    """
    rows = db.execute(text("""
      WITH """ + KONSESI_VERSION_CTE + """, konsesi_group AS (
        SELECT """ + KONSESI_KEY_SQL + """ AS key,
          min(cv.record_state) AS record_state,
          array_agg(DISTINCT cv.dataset_id::text) AS dataset_ids,
          coalesce(max(nullif(fv.original_properties->>'Nama_Serti', '')), regexp_replace(min(fv.name), '\\s+\\(bagian \\d+\\)$', '')) AS nama,
          coalesce(max(nullif(fv.extra_attributes->>'lokasi', '')), max(nullif(fv.original_properties->>'Kebun', '')), max(nullif(fv.original_properties->>'kebun', '')), '') AS lokasi,
          max(nullif(kd.jenis_alas_hak, '')) AS jenis_alas_hak,
          max(nullif(kd.nomor_alas_hak, '')) AS nomor_alas_hak,
          max(kd.declared_area_m2) AS luas_dokumen_m2,
          ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM konsesi_version cv
        JOIN gis_feature_versions fv ON fv.dataset_version_id=cv.version_id
        LEFT JOIN gis_konsesi_details kd ON kd.feature_version_id=fv.id
        GROUP BY 1
      ), admin_region AS (
        SELECT ad.level, ad.region_code, ad.region_name, ad.parent_code, fv.geom
        FROM gis_administrasi_details ad
        JOIN gis_feature_versions fv ON fv.id=ad.feature_version_id
        JOIN gis_datasets d ON d.active_version_id=fv.dataset_version_id AND d.archived_at IS NULL
      )
      -- Only kecamatan outlines are tested spatially; province outlines are far
      -- too detailed, and kabupaten/provinsi follow from the parent codes.
      SELECT g.key, g.record_state, g.dataset_ids, g.nama, g.lokasi, g.jenis_alas_hak, g.nomor_alas_hak,
        round((g.luas_dokumen_m2 / 10000)::numeric, 4) AS luas_dokumen_ha,
        round((ST_Area(g.geom::geography) / 10000)::numeric, 4) AS luas_gis_ha,
        concat_ws(',', ST_XMin(Box2D(g.geom)::box3d), ST_YMin(Box2D(g.geom)::box3d), ST_XMax(Box2D(g.geom)::box3d), ST_YMax(Box2D(g.geom)::box3d)) AS bbox,
        prov.region_name AS provinsi, kab.region_name AS kabupaten, kec.region_name AS kecamatan,
        kp.kode_sap, kp.alamat_jalan,
        sppt.tahun AS sppt_tahun, sppt.njop_tanah_per_m2, sppt.njop_bangunan_per_m2,
        coalesce(bg.jumlah, 0) AS bangunan_jumlah, coalesce(bg.luas_m2, 0) AS bangunan_luas_m2
      FROM konsesi_group g
      LEFT JOIN konsesi_profil kp ON kp.konsesi_key=g.key
      LEFT JOIN LATERAL (
        SELECT s.tahun, s.njop_tanah_per_m2, s.njop_bangunan_per_m2 FROM konsesi_sppt s
        WHERE s.konsesi_key=g.key ORDER BY s.tahun DESC, s.created_at DESC LIMIT 1
      ) sppt ON true
      LEFT JOIN (
        SELECT konsesi_key, count(*) AS jumlah, sum(luas_m2) AS luas_m2 FROM konsesi_bangunan GROUP BY konsesi_key
      ) bg ON bg.konsesi_key=g.key
      LEFT JOIN LATERAL (
        SELECT r.region_name, r.parent_code FROM admin_region r
        WHERE r.level='kecamatan' AND ST_Intersects(r.geom, ST_PointOnSurface(g.geom)) LIMIT 1
      ) kec ON true
      LEFT JOIN LATERAL (
        SELECT r.region_name, r.parent_code FROM admin_region r
        WHERE r.level='kabupaten_kota' AND (r.region_code=kec.parent_code
          OR (kec.parent_code IS NULL AND ST_Intersects(r.geom, ST_PointOnSurface(g.geom))))
        LIMIT 1
      ) kab ON true
      LEFT JOIN LATERAL (SELECT r.region_name FROM admin_region r WHERE r.level='provinsi' AND r.region_code=kab.parent_code LIMIT 1) prov ON true
      ORDER BY g.lokasi, g.nama
    """)).mappings().all()
    data = []
    for row in rows:
        item = dict(row)
        for field in ("luas_dokumen_ha", "luas_gis_ha", "njop_tanah_per_m2", "njop_bangunan_per_m2", "bangunan_luas_m2"):
            item[field] = float(item[field]) if item[field] is not None else None
        data.append(item)
    return {"data": data}


@router.get("/opset/luas-konsesi")
def list_opset_area_per_konsesi(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Area of each optimised asset's kerja sama polygons inside each concession.

    Feeds the proportional PBB and potensi: an asset's share of a concession
    is its published OPSET area within that concession, unioned so repeated
    or renewed agreements over the same ground are not counted twice.
    """
    rows = db.execute(text("""
      WITH """ + KONSESI_VERSION_CTE + """, konsesi AS (
        SELECT """ + KONSESI_KEY_SQL + """ AS konsesi_key, ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM konsesi_version cv JOIN gis_feature_versions fv ON fv.dataset_version_id=cv.version_id
        GROUP BY 1
      ), opset_aset AS (
        SELECT ks_aset.aset_id, ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM gis_opset_details od
        JOIN gis_feature_versions fv ON fv.id=od.feature_version_id
        JOIN gis_datasets d ON d.active_version_id=fv.dataset_version_id AND d.archived_at IS NULL
        JOIN (
          SELECT id AS ks_id, aset_id FROM kerja_sama WHERE aset_id IS NOT NULL
          UNION SELECT ks_id, aset_id FROM kerja_sama_aset
        ) ks_aset ON ks_aset.ks_id=od.kerja_sama_id
        GROUP BY ks_aset.aset_id
      )
      SELECT o.aset_id::text AS aset_id, k.konsesi_key,
        round(ST_Area(ST_Intersection(o.geom, k.geom)::geography)::numeric, 2) AS luas_m2
      FROM opset_aset o JOIN konsesi k ON ST_Intersects(o.geom, k.geom)
    """)).mappings().all()
    return {"data": [{**dict(row), "luas_m2": float(row["luas_m2"])} for row in rows if row["luas_m2"] and row["luas_m2"] > 0]}


@router.get("/konsesi/summary/grouped")
def list_grouped_konsesi_summaries(
    admin_level: str | None = Query(default=None, pattern="^(provinsi|kabupaten_kota|kecamatan|desa_kelurahan)$"),
    admin_region_code: str | None = Query(default=None, max_length=64),
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Return one row per source land asset, merging multipart KMZ polygons.

    With an administrative region, each concession is clipped to that region
    so every hectare figure only counts the part lying inside it.
    """
    if bool(admin_level) != bool(admin_region_code):
        raise HTTPException(status_code=422, detail="Tingkat dan kode wilayah harus diisi bersamaan")
    region_geom = None
    if admin_level:
        region_geom = db.execute(text("""
          SELECT ST_AsEWKB(ST_UnaryUnion(ST_Collect(fv.geom)))
          FROM gis_administrasi_details ad
          JOIN gis_feature_versions fv ON fv.id=ad.feature_version_id
          JOIN gis_datasets d ON d.active_version_id=fv.dataset_version_id
          WHERE ad.level=:level AND ad.region_code=:code AND d.archived_at IS NULL
        """), {"level": admin_level, "code": admin_region_code}).scalar_one()
        if region_geom is None:
            raise HTTPException(status_code=404, detail="Wilayah administrasi tidak ditemukan")
        region_geom = bytes(region_geom)
    rows = db.execute(text("""
      WITH konsesi_version AS (
        SELECT d.id AS dataset_id,
          coalesce(d.active_version_id, (
            SELECT i.candidate_version_id FROM gis_imports i
            WHERE i.dataset_id=d.id AND i.state IN ('mapping_required', 'ready')
            ORDER BY i.created_at DESC LIMIT 1
          )) AS version_id,
          CASE WHEN d.active_version_id IS NULL THEN 'draf' ELSE 'terbit' END AS record_state
        FROM gis_datasets d WHERE d.kind='konsesi' AND d.archived_at IS NULL
      ), category_geom AS (
        SELECT d.kind, ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM gis_feature_versions fv
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE d.active_version_id=fv.dataset_version_id
          AND d.kind IN ('tanaman', 'hutan', 'opset', 'okupasi')
        GROUP BY d.kind
      ), available_mask AS (
        SELECT ST_UnaryUnion(ST_Collect(geom)) AS geom
        FROM category_geom WHERE kind IN ('tanaman', 'hutan', 'opset', 'okupasi')
      ), konsesi_group AS (
        SELECT """ + KONSESI_KEY_SQL + """ AS id,
          cv.record_state, d.id AS dataset_id,
          coalesce(max(nullif(kd.nomor_alas_hak, '')), max(nullif(fv.original_properties->>'Nama_Serti', '')), min(fv.name)) AS kode_aset,
          coalesce(max(nullif(fv.original_properties->>'Nama_Serti', '')), regexp_replace(min(fv.name), '\\s+\\(bagian \\d+\\)$', '')) AS nama_aset,
          coalesce(max(nullif(fv.extra_attributes->>'lokasi', '')), max(nullif(fv.original_properties->>'Kebun', '')), max(nullif(fv.original_properties->>'kebun', '')), '') AS lokasi,
          max(nullif(kd.nomor_alas_hak, '')) AS nomor_alas_hak,
          max(nullif(kd.jenis_alas_hak, '')) AS jenis_alas_hak,
          max(nullif(fv.extra_attributes->>'pemegang_hak', '')) AS pemegang_hak,
          max(nullif(fv.extra_attributes->>'sumber_dokumen', '')) AS sumber_dokumen,
          max(nullif(fv.extra_attributes->>'catatan', '')) AS catatan,
          max(nullif(fv.extra_attributes->>'tanggal_mulai', '')::date) AS tanggal_mulai,
          max(kd.tanggal_terbit) AS tanggal_terbit,
          max(kd.tanggal_berakhir) AS tanggal_berakhir,
          CASE WHEN bool_or(kd.expiry_mode='fixed') THEN 'fixed' WHEN bool_or(kd.expiry_mode='indefinite') THEN 'indefinite' ELSE 'unknown' END AS expiry_mode,
          ST_UnaryUnion(ST_Collect(fv.geom)) AS full_geom
        FROM konsesi_version cv
        JOIN gis_feature_versions fv ON fv.dataset_version_id=cv.version_id
        JOIN gis_datasets d ON d.id=cv.dataset_id
        LEFT JOIN gis_konsesi_details kd ON kd.feature_version_id=fv.id
        GROUP BY cv.record_state, d.id, coalesce(fv.original_properties->>'Kebun', fv.original_properties->>'kebun', ''), coalesce(fv.original_properties->>'FID_Areal', fv.original_properties->>'fid_areal', fv.original_properties->>'Nama_Serti', fv.name)
      ), region_piece AS (
        -- Province outlines carry hundreds of thousands of coastline vertices;
        -- clipping against small subdivided pieces keeps the intersection fast.
        SELECT ST_Subdivide(ST_GeomFromEWKB(CAST(:region AS bytea)), 256) AS geom
      ), konsesi_numbered AS (
        SELECT row_number() OVER () AS row_key, * FROM konsesi_group
      ), konsesi_clip AS (
        SELECT n.row_key, ST_CollectionExtract(ST_UnaryUnion(ST_Collect(ST_Intersection(n.full_geom, p.geom))), 3) AS geom
        FROM konsesi_numbered n JOIN region_piece p ON ST_Intersects(n.full_geom, p.geom)
        GROUP BY n.row_key
      ), konsesi_scoped AS (
        SELECT n.*, CASE WHEN CAST(:region AS bytea) IS NULL THEN n.full_geom ELSE c.geom END AS geom
        FROM konsesi_numbered n LEFT JOIN konsesi_clip c ON c.row_key=n.row_key
        WHERE CAST(:region AS bytea) IS NULL OR c.geom IS NOT NULL
      )
      SELECT cg.id, cg.record_state, cg.kode_aset, cg.nama_aset, cg.lokasi,
        cg.nomor_alas_hak, cg.jenis_alas_hak, cg.pemegang_hak, cg.sumber_dokumen, cg.catatan,
        cg.tanggal_mulai, cg.tanggal_terbit, cg.tanggal_berakhir, cg.expiry_mode,
        1::integer AS konsesi_count, ARRAY[cg.nama_aset]::text[] AS konsesi_names,
        ARRAY[cg.dataset_id::text]::text[] AS dataset_ids,
        concat_ws(',', ST_XMin(Box2D(cg.geom)::box3d), ST_YMin(Box2D(cg.geom)::box3d), ST_XMax(Box2D(cg.geom)::box3d), ST_YMax(Box2D(cg.geom)::box3d)) AS bbox,
        ST_Y(ST_PointOnSurface(cg.geom)) AS center_lat,
        ST_X(ST_PointOnSurface(cg.geom)) AS center_lng,
        ST_AsGeoJSON(cg.geom) AS geom_json,
        md5(ST_AsEWKB(cg.geom)::text) AS geom_hash,
        round((ST_Area(cg.geom::geography) / 10000)::numeric, 4) AS konsesi_area_ha,
        round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='tanaman'))::geography) / 10000), 0)::numeric, 4) AS tanaman_area_ha,
        CASE WHEN EXISTS (SELECT 1 FROM category_geom WHERE kind='hutan')
          THEN round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='hutan'))::geography) / 10000), 0)::numeric, 4)
          ELSE NULL END AS hutan_area_ha,
        round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='okupasi'))::geography) / 10000), 0)::numeric, 4) AS okupasi_area_ha,
        round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='opset'))::geography) / 10000), 0)::numeric, 4) AS kerja_sama_area_ha,
        CASE WHEN EXISTS (SELECT 1 FROM category_geom WHERE kind='hutan')
          THEN round((ST_Area(ST_Difference(cg.geom, coalesce((SELECT geom FROM available_mask), ST_GeomFromText('MULTIPOLYGON EMPTY', 4326)))::geography) / 10000)::numeric, 4)
          ELSE NULL END AS dapat_dimanfaatkan_area_ha
      FROM konsesi_scoped cg
      WHERE NOT ST_IsEmpty(cg.geom)
      ORDER BY cg.lokasi, cg.nama_aset
    """), {"region": region_geom}).mappings().all()
    active_kinds = set(db.execute(text("""
      SELECT DISTINCT kind FROM gis_datasets
      WHERE active_version_id IS NOT NULL AND archived_at IS NULL
    """)).scalars().all())
    missing_layers = sorted({"konsesi", "tanaman", "hutan", "opset", "okupasi"} - active_kinds)
    result = []
    today = datetime.now(timezone(timedelta(hours=8))).date()
    for row in rows:
        item = dict(row)
        if not item['nomor_alas_hak'] and not item['jenis_alas_hak']:
            item['rights_status'] = 'belum_beralas_hak'
        elif not item['nomor_alas_hak'] or not item['jenis_alas_hak']:
            item['rights_status'] = 'belum_lengkap'
        elif item['tanggal_mulai'] and item['tanggal_mulai'] > today:
            item['rights_status'] = 'belum_berlaku'
        elif item['tanggal_berakhir'] and item['tanggal_berakhir'] < today:
            item['rights_status'] = 'berakhir'
        elif item['expiry_mode'] == 'indefinite' or item['tanggal_berakhir']:
            item['rights_status'] = 'berlaku'
        else:
            item['rights_status'] = 'belum_diketahui'
        item["konsesi_names"] = item["konsesi_names"] or []
        item["dataset_ids"] = item["dataset_ids"] or []
        for field in ("konsesi_area_ha", "tanaman_area_ha", "hutan_area_ha", "okupasi_area_ha", "kerja_sama_area_ha", "dapat_dimanfaatkan_area_ha"):
            item[field] = float(item[field]) if item[field] is not None else None
        for field in ("center_lat", "center_lng"):
            item[field] = float(item[field]) if item[field] is not None else None
        item["missing_layers"] = missing_layers
        item["analysis_status"] = (
            "draf — lengkapi informasi sebelum diterbitkan" if item["record_state"] == "draf"
            else "estimasi — layer belum lengkap" if item["missing_layers"]
            else "estimasi berdasarkan layer aktif"
        )
        item.pop("geom_json", None)
        item.pop("geom_hash", None)
        result.append(item)
    return {"data": result, "availability_note": "Kawasan hutan dihitung dari layer kawasan hutan yang diunggah. Sisa dapat dimanfaatkan adalah estimasi spasial: konsesi dikurangi gabungan unik tanaman, kawasan hutan, okupasi, dan area kerja sama. Konfirmasi legal tetap diperlukan."}


@router.get("/reference/administrasi")
def list_administrasi_reference(
    level: str | None = None,
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    valid_levels = {"provinsi", "kabupaten_kota", "kecamatan", "desa_kelurahan"}
    if level and level not in valid_levels:
        raise HTTPException(status_code=422, detail="Tingkat batas administrasi tidak valid")
    rows = db.execute(text("""
      WITH regions AS (
        SELECT ad.level, ad.region_code, ad.region_name, ad.parent_code, ST_Extent(fv.geom)::box2d AS bounds
        FROM gis_administrasi_details ad
        JOIN gis_feature_versions fv ON fv.id=ad.feature_version_id
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE d.active_version_id=fv.dataset_version_id
          AND (:level IS NULL OR ad.level=:level)
        GROUP BY ad.level, ad.region_code, ad.region_name, ad.parent_code
      )
      SELECT level, region_code, region_name, parent_code,
        ST_XMin(bounds::box3d) AS min_lng, ST_YMin(bounds::box3d) AS min_lat,
        ST_XMax(bounds::box3d) AS max_lng, ST_YMax(bounds::box3d) AS max_lat
      FROM regions ORDER BY level, region_name LIMIT 5000
    """), {"level": level}).mappings().all()
    return {"data": [{
        "level": row["level"], "region_code": row["region_code"], "region_name": row["region_name"], "parent_code": row["parent_code"],
        "bbox": ",".join(str(float(row[key])) for key in ("min_lng", "min_lat", "max_lng", "max_lat")),
    } for row in rows]}


@router.get("/reference/hutan-functions")
def list_hutan_functions(
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    rows = db.execute(text("""
      SELECT DISTINCT hd.fungsi_normalized
      FROM gis_hutan_details hd
      JOIN gis_feature_versions fv ON fv.id=hd.feature_version_id
      JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
      JOIN gis_datasets d ON d.id=v.dataset_id
      WHERE d.active_version_id=fv.dataset_version_id
        AND nullif(trim(hd.fungsi_normalized), '') IS NOT NULL
      ORDER BY hd.fungsi_normalized
    """)).scalars().all()
    return {"data": rows}


@router.patch("/imports/{import_id}/mapping")
def update_import_mapping(
    import_id: str,
    body: ImportMappingBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    imp = db.execute(text("""
      SELECT i.*, d.kind FROM gis_imports i JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id
    """), {"id": import_id}).mappings().first()
    if not imp:
        raise HTTPException(status_code=404, detail="Impor GIS tidak ditemukan")
    require_domain(db, user, imp["kind"])
    try:
        result = apply_mapping(db, import_id, body.model_dump(mode="json"))
        db.commit()
        return result
    except GISImportError as exc:
        db.rollback()
        raise _error(exc) from None


@router.patch("/imports/{import_id}/features/{feature_id}")
def update_draft_feature(
    import_id: str,
    feature_id: str,
    body: FeatureDraftPatchBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    imp = db.execute(text("""
      SELECT i.*, d.kind FROM gis_imports i JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id FOR UPDATE
    """), {"id": import_id}).mappings().first()
    if not imp:
        raise HTTPException(status_code=404, detail="Impor GIS tidak ditemukan")
    require_domain(db, user, imp["kind"])
    if imp["state"] not in {"mapping_required", "ready"} or imp["draft_revision"] != body.expected_draft_revision:
        raise HTTPException(status_code=409, detail="Draf impor telah berubah. Muat ulang data.")
    current_feature = db.execute(text("""
      SELECT id, name, original_properties FROM gis_feature_versions
      WHERE id=:feature_id AND dataset_version_id=:version_id
    """), {"feature_id": feature_id, "version_id": imp["candidate_version_id"]}).mappings().first()
    if not current_feature:
        raise HTTPException(status_code=404, detail="Feature draf tidak ditemukan")
    if body.name is not None and not body.name.strip():
        raise HTTPException(status_code=422, detail="Nama poligon tidak boleh kosong")
    if body.original_properties is not None and (
        len(body.original_properties) > 200
        or any(not isinstance(key, str) or not key.strip() or len(key) > 150
               or isinstance(value, (dict, list)) for key, value in body.original_properties.items())
    ):
        raise HTTPException(status_code=422, detail="Atribut sumber harus berupa pasangan nama dan nilai sederhana")
    try:
        if body.name is not None or body.original_properties is not None:
            db.execute(text("""
              UPDATE gis_feature_versions
              SET name=coalesce(:name, name),
                  original_properties=original_properties || coalesce(CAST(:properties AS jsonb), '{}'::jsonb)
              WHERE id=:feature_id
            """), {"name": body.name.strip() if body.name is not None else None,
                   "properties": json.dumps(body.original_properties, ensure_ascii=False) if body.original_properties is not None else None,
                   "feature_id": feature_id})
        write_detail(db, imp["kind"], feature_id, body.attributes, user["id"])
        if imp["kind"] == "konsesi" and body.linked_asset_ids is not None:
            db.execute(text("DELETE FROM gis_konsesi_aset WHERE konsesi_feature_version_id=:feature_id"), {"feature_id": feature_id})
            for aset_id in sorted(set(body.linked_asset_ids)):
                db.execute(text("""
                  INSERT INTO gis_konsesi_aset (konsesi_feature_version_id, aset_id, linked_by)
                  VALUES (:feature_id, :aset_id, :actor_id)
                """), {"feature_id": feature_id, "aset_id": aset_id, "actor_id": user["id"]})
        readiness = refresh_import_readiness(db, import_id)
        db.execute(text("""
          INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, version_id, details)
          VALUES (:actor_id, 'feature_metadata_updated', :dataset_id, :version_id, CAST(:details AS jsonb))
        """), {"actor_id": user["id"], "dataset_id": imp["dataset_id"],
               "version_id": imp["candidate_version_id"],
               "details": json.dumps({"feature_id": feature_id, "old_name": current_feature["name"],
                                      "new_name": body.name, "source_properties_changed": body.original_properties is not None})})
        db.commit()
        return {"ok": True, **readiness}
    except GISImportError as exc:
        db.rollback()
        raise _error(exc) from None


@router.post("/imports/{import_id}/publish")
def publish_import(
    import_id: str,
    body: PublishBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    imp = db.execute(text("""
      SELECT i.*, d.kind, d.active_version_id, d.revision FROM gis_imports i JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id FOR UPDATE
    """), {"id": import_id}).mappings().first()
    if not imp:
        raise HTTPException(status_code=404, detail="Impor GIS tidak ditemukan")
    require_domain(db, user, imp["kind"])
    if imp["state"] != "ready" or imp["expires_at"] <= db.execute(text("SELECT now()")).scalar_one():
        raise HTTPException(status_code=422, detail="Impor belum siap atau telah kedaluwarsa")
    if imp["report_hash"] != body.report_hash:
        raise HTTPException(status_code=409, detail="Laporan validasi telah berubah. Tinjau ulang.")
    if imp["active_version_id"] != body.expected_active_version_id or imp["revision"] != body.expected_revision:
        raise HTTPException(status_code=409, detail="Dataset telah berubah. Muat ulang sebelum menerbitkan.")
    feature_count = db.execute(text("SELECT count(*) FROM gis_feature_versions WHERE dataset_version_id=:version_id"), {"version_id": imp["candidate_version_id"]}).scalar_one()
    if not feature_count:
        raise HTTPException(status_code=422, detail="Tidak ada polygon valid untuk diterbitkan")
    db.execute(text("""
      UPDATE gis_dataset_versions SET state='published', published_at=now(), change_note=coalesce(:note, change_note)
      WHERE id=:id AND state='draft'
    """), {"id": imp["candidate_version_id"], "note": body.note})
    updated = db.execute(text("""
      UPDATE gis_datasets SET active_version_id=:version_id, revision=revision+1
      WHERE id=:dataset_id AND revision=:expected_revision RETURNING revision
    """), {"version_id": imp["candidate_version_id"], "dataset_id": imp["dataset_id"], "expected_revision": body.expected_revision}).scalar_one_or_none()
    if updated is None:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset berubah saat publikasi")
    db.execute(text("UPDATE gis_imports SET state='published', warning_ack=CAST(:warnings AS jsonb), updated_at=now() WHERE id=:id"), {"id": import_id, "warnings": json.dumps(body.acknowledged_warning_codes)})
    db.execute(text("""
      INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, version_id, details)
      VALUES (:actor_id, 'version_published', :dataset_id, :version_id, CAST(:details AS jsonb))
    """), {"actor_id": user["id"], "dataset_id": imp["dataset_id"], "version_id": imp["candidate_version_id"], "details": json.dumps({"import_id": import_id, "warnings": body.acknowledged_warning_codes})})
    snapshot = db.execute(text("""
      SELECT coalesce(jsonb_agg(jsonb_build_object('dataset_id', id, 'version_id', active_version_id, 'kind', kind)), '[]'::jsonb)
      FROM gis_datasets WHERE active_version_id IS NOT NULL AND archived_at IS NULL
    """)).scalar_one()
    analysis_id = db.execute(text("""
      INSERT INTO gis_analysis_runs (subject_version_id, selection_snapshot, business_snapshot, algorithm_version)
      VALUES (:version_id, CAST(:snapshot AS jsonb), CAST(:business AS jsonb), 'overlap-v1') RETURNING id
    """), {"version_id": imp["candidate_version_id"], "snapshot": json.dumps(snapshot, default=str), "business": json.dumps({"dataset_id": imp["dataset_id"], "kind": imp["kind"]}, default=str)}).scalar_one()
    db.execute(text("INSERT INTO gis_jobs (job_type, subject_id) VALUES ('analysis', :subject_id)"), {"subject_id": analysis_id})
    db.commit()
    return {"version_id": str(imp["candidate_version_id"]), "dataset_revision": updated, "analysis_id": str(analysis_id), "analysis_state": "pending"}


@router.get("/datasets/{dataset_id}/overlap-warnings")
def overlap_warnings(
    dataset_id: str,
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    dataset = dataset_row(db, dataset_id)
    if not dataset["active_version_id"]:
        return {"state": "none", "totals": {}, "data": []}
    run = db.execute(text("""
      SELECT * FROM gis_analysis_runs WHERE subject_version_id=:version_id ORDER BY started_at DESC NULLS LAST LIMIT 1
    """), {"version_id": dataset["active_version_id"]}).mappings().first()
    if not run:
        return {"state": "pending", "totals": {}, "data": []}
    rows = db.execute(text("""
      SELECT ai.warning_code, ai.relation_kind, ai.intersection_area_m2, ai.subject_percent, target.name AS target_name
      FROM gis_analysis_items ai JOIN gis_feature_versions target ON target.id=ai.target_feature_version_id
      WHERE ai.run_id=:run_id ORDER BY ai.intersection_area_m2 DESC LIMIT 100
    """), {"run_id": run["id"]}).mappings().all()
    return {"state": run["state"], "totals": run["totals"], "data": [dict(row) for row in rows]}


@router.post("/datasets/{dataset_id}/rollback")
def rollback_dataset(
    dataset_id: str,
    body: RollbackBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    dataset = require_dataset_domain(db, user, dataset_id)
    target = version_row(db, body.target_version_id)
    if target["dataset_id"] != dataset_id or target["state"] != "published":
        raise HTTPException(status_code=422, detail="Versi rollback harus versi terbit dari dataset yang sama")
    revision = db.execute(text("""
      UPDATE gis_datasets SET active_version_id=:version_id, revision=revision+1
      WHERE id=:dataset_id AND revision=:expected_revision RETURNING revision
    """), {"version_id": body.target_version_id, "dataset_id": dataset_id, "expected_revision": body.expected_revision}).scalar_one_or_none()
    if revision is None:
        db.rollback()
        raise HTTPException(status_code=409, detail="Dataset telah berubah. Muat ulang.")
    db.execute(text("""
      INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, version_id, details)
      VALUES (:actor_id, 'version_rollback', :dataset_id, :version_id, CAST(:details AS jsonb))
    """), {"actor_id": user["id"], "dataset_id": dataset_id, "version_id": body.target_version_id, "details": json.dumps({"reason": body.reason})})
    db.commit()
    return {"active_version_id": body.target_version_id, "dataset_revision": revision}


@router.get("/features")
def list_features(
    bbox: str = Query(..., description="minLng,minLat,maxLng,maxLat in EPSG:4326"),
    version_ids: str = Query(..., description="Comma-separated published version IDs"),
    admin_level: str | None = Query(default=None),
    admin_region_code: str | None = Query(default=None),
    hutan_function: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=200, ge=1, le=500),
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    try:
        min_lng, min_lat, max_lng, max_lat = [float(part) for part in bbox.split(",")]
        if not (-180 <= min_lng < max_lng <= 180 and -90 <= min_lat < max_lat <= 90):
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=422, detail="BBOX peta tidak valid") from None
    ids = [item.strip() for item in version_ids.split(",") if item.strip()]
    if not ids or len(ids) > 12:
        raise HTTPException(status_code=422, detail="Pilih 1 hingga 12 versi layer")
    valid_levels = {"provinsi", "kabupaten_kota", "kecamatan", "desa_kelurahan"}
    if admin_region_code and admin_level not in valid_levels:
        raise HTTPException(status_code=422, detail="Filter wilayah membutuhkan tingkat batas yang valid")
    rows = db.execute(text("""
      SELECT fv.id, fv.feature_id, fv.name, d.id AS dataset_id, d.kind, fv.computed_area_m2,
        CASE WHEN d.kind='konsesi' THEN """ + KONSESI_KEY_SQL + """ END AS konsesi_key,
        (coalesce(
          to_jsonb(kd) - 'feature_version_id', to_jsonb(td) - 'feature_version_id',
          to_jsonb(hd) - 'feature_version_id', to_jsonb(od) - 'feature_version_id',
          to_jsonb(ocd) - 'feature_version_id', to_jsonb(ad) - 'feature_version_id', '{}'::jsonb
        ) || jsonb_strip_nulls(jsonb_build_object('nama_mitra', ks.nama_mitra, 'no_perjanjian', ks.no_perjanjian, 'skema_kerja_sama', ks.skema_kerja_sama, 'tanggal_mulai', ks.tgl_mulai, 'tanggal_berakhir', ks.tgl_selesai)) || fv.extra_attributes) AS attributes,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(fv.geom, 0.00001)) AS geometry
      FROM gis_feature_versions fv
      JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
      JOIN gis_datasets d ON d.id=v.dataset_id
      LEFT JOIN gis_konsesi_details kd ON kd.feature_version_id=fv.id
      LEFT JOIN gis_tanaman_details td ON td.feature_version_id=fv.id
      LEFT JOIN gis_hutan_details hd ON hd.feature_version_id=fv.id
      LEFT JOIN gis_opset_details od ON od.feature_version_id=fv.id
      LEFT JOIN kerja_sama ks ON ks.id=od.kerja_sama_id
      LEFT JOIN gis_okupasi_details ocd ON ocd.feature_version_id=fv.id
      LEFT JOIN gis_administrasi_details ad ON ad.feature_version_id=fv.id
      WHERE fv.dataset_version_id = ANY(CAST(:version_ids AS uuid[]))
        AND fv.geom && ST_MakeEnvelope(:min_lng, :min_lat, :max_lng, :max_lat, 4326)
        AND (:hutan_function IS NULL OR (d.kind='hutan' AND hd.fungsi_normalized=:hutan_function))
        AND (:admin_region_code IS NULL OR EXISTS (
          SELECT 1 FROM gis_administrasi_details ad
          JOIN gis_feature_versions av ON av.id=ad.feature_version_id
          JOIN gis_dataset_versions avv ON avv.id=av.dataset_version_id
          JOIN gis_datasets adataset ON adataset.id=avv.dataset_id
          WHERE adataset.active_version_id=av.dataset_version_id
            AND ad.level=:admin_level AND ad.region_code=:admin_region_code
            AND ST_Intersects(fv.geom, av.geom)
        ))
      LIMIT :limit
    """), {"version_ids": ids, "min_lng": min_lng, "min_lat": min_lat, "max_lng": max_lng, "max_lat": max_lat, "limit": limit,
             "admin_level": admin_level, "admin_region_code": admin_region_code, "hutan_function": hutan_function}).mappings().all()
    return {"type": "FeatureCollection", "features": [
      {"type": "Feature", "id": str(row["id"]), "properties": {"feature_id": str(row["feature_id"]), "dataset_id": str(row["dataset_id"]), "name": row["name"], "kind": row["kind"], "computed_area_m2": float(row["computed_area_m2"]), "konsesi_key": row["konsesi_key"], "attributes": row["attributes"] or {}}, "geometry": json.loads(row["geometry"])}
      for row in rows
    ], "truncated": len(rows) == limit}


@router.get("/files/{file_id}/download")
def download_original(
    file_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    row = db.execute(text("""
      SELECT sf.original_name, sf.storage_key, d.kind FROM gis_source_files sf
      JOIN gis_dataset_versions v ON v.id=sf.version_id JOIN gis_datasets d ON d.id=v.dataset_id
      WHERE sf.id=:id
    """), {"id": file_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="File GIS tidak ditemukan")
    require_domain(db, user, row["kind"])
    try:
        path = source_path(row["storage_key"])
    except GISStorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from None
    return FileResponse(path, filename=row["original_name"])


@router.get("/users/{user_id}/grants")
def get_grants(user_id: str, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    domains = db.execute(text("SELECT domain FROM gis_domain_grants WHERE user_id=:user_id ORDER BY domain"), {"user_id": user_id}).scalars().all()
    return {"user_id": user_id, "domains": domains}


@router.patch("/users/{user_id}/grants")
def update_grants(user_id: str, body: GrantsBody, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    exists = db.execute(text("SELECT 1 FROM app_users WHERE id=:id"), {"id": user_id}).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    db.execute(text("DELETE FROM gis_domain_grants WHERE user_id=:user_id"), {"user_id": user_id})
    for domain in sorted(set(body.domains)):
        db.execute(text("INSERT INTO gis_domain_grants (user_id, domain, granted_by) VALUES (:user_id, :domain, :granted_by)"), {"user_id": user_id, "domain": domain, "granted_by": admin["id"]})
    db.execute(text("INSERT INTO gis_audit_events (actor_id, event_type, details) VALUES (:actor_id, 'grants_updated', CAST(:details AS jsonb))"), {"actor_id": admin["id"], "details": json.dumps({"user_id": user_id, "domains": body.domains})})
    db.commit()
    return {"user_id": user_id, "domains": sorted(set(body.domains))}
