"""Authenticated GIS API. GIS data deliberately does not use generic REST routes."""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import SessionLocal, get_db
from schemas_gis import (
    DatasetCreateBody, DatasetUpdateBody, FeatureDraftPatchBody, GrantsBody,
    ImportMappingBody, PublishBody, RollbackBody,
)
from services.auth_deps import CurrentUser, require_admin, require_app_read
from services.gis.importer import GISImportError
from services.gis.permissions import DOMAIN_BY_KIND, domains_for_user, require_dataset_domain, require_domain
from services.gis.repository import (
    apply_mapping, create_draft_version, dataset_row, refresh_import_readiness, report_hash, version_row, write_detail,
)
from services.gis.storage import GISStorageError, save_original, source_path


router = APIRouter(prefix="/api/gis", tags=["GIS"])

OFFICIAL_FOREST_EXPORT = "https://geoportal.planologi.kehutanan.go.id/server/rest/services/Peta_Interaktif_2026/KWSHUTAN_AR_250K/MapServer/export"
OFFICIAL_FOREST_SOURCE_KEY = "KWSHUTAN_AR_250K_JUN2026"
OFFICIAL_FOREST_SOURCE_YEAR = 2026
OFFICIAL_FOREST_RASTER_SIZE = 768
OFFICIAL_FOREST_COLORS = {
    (173, 63, 255): "Kawasan Konservasi",
    (2, 173, 0): "Hutan Lindung",
    (255, 255, 0): "Hutan Produksi Tetap",
    (138, 242, 0): "Hutan Produksi Terbatas",
    (255, 94, 255): "Hutan Produksi yang dapat di Konversi",
    (255, 255, 255): "Area Penggunaan Lain",
    (0, 197, 255): "Tubuh Air",
    (255, 0, 0): "Tidak Terdefinisi",
}


def _forest_class_from_pixel(red: int, green: int, blue: int) -> str | None:
    """Return a forest class from the official renderer's fill colour.

    Exported images have anti-aliased edges, so nearby colours are accepted.
    APL, water, and undefined pixels intentionally do not count as forest.
    """
    nearest, name = min(
        OFFICIAL_FOREST_COLORS.items(),
        key=lambda item: sum((item[0][index] - (red, green, blue)[index]) ** 2 for index in range(3)),
    )
    distance = sum((nearest[index] - (red, green, blue)[index]) ** 2 for index in range(3))
    if distance > 1_800 or name in {"Area Penggunaan Lain", "Tubuh Air", "Tidak Terdefinisi"}:
        return None
    return name


def _ring_pixels(ring: list[list[float]], bounds: tuple[float, float, float, float], size: int) -> list[tuple[float, float]]:
    west, south, east, north = bounds
    span_lng = east - west
    span_lat = north - south
    return [
        ((float(point[0]) - west) / span_lng * (size - 1), (north - float(point[1])) / span_lat * (size - 1))
        for point in ring
    ]


def _draw_polygon_mask(draw: ImageDraw.ImageDraw, geometry: dict[str, Any], bounds: tuple[float, float, float, float], size: int) -> None:
    polygons = [geometry.get("coordinates", [])] if geometry.get("type") == "Polygon" else geometry.get("coordinates", [])
    for polygon in polygons:
        if not polygon:
            continue
        draw.polygon(_ring_pixels(polygon[0], bounds, size), fill=255)
        for hole in polygon[1:]:
            draw.polygon(_ring_pixels(hole, bounds, size), fill=0)


def _measure_official_forest(item: dict[str, Any]) -> tuple[float, dict[str, float]]:
    """Estimate forest coverage inside one concession using Kemenhut's official map.

    The public source is a MapServer whose geometry query is disabled.  We
    therefore rasterise the supplied concession polygon as a mask and measure
    the official map pixels inside it.  The result is fit for a 1:250,000 map
    estimate and is never represented as a legal area determination.
    """
    west, south, east, north = (float(value) for value in item["bbox"].split(","))
    pad_lng = max((east - west) * 0.03, 0.0001)
    pad_lat = max((north - south) * 0.03, 0.0001)
    bounds = (west - pad_lng, south - pad_lat, east + pad_lng, north + pad_lat)
    params = {
        "bbox": ",".join(str(value) for value in bounds),
        "bboxSR": "4326",
        "imageSR": "4326",
        "size": f"{OFFICIAL_FOREST_RASTER_SIZE},{OFFICIAL_FOREST_RASTER_SIZE}",
        "format": "png32",
        "transparent": "true",
        "layers": "show:0",
        "f": "image",
    }
    response = httpx.get(OFFICIAL_FOREST_EXPORT, params=params, timeout=45.0)
    response.raise_for_status()
    image = Image.open(BytesIO(response.content)).convert("RGB")
    if image.size != (OFFICIAL_FOREST_RASTER_SIZE, OFFICIAL_FOREST_RASTER_SIZE):
        image = image.resize((OFFICIAL_FOREST_RASTER_SIZE, OFFICIAL_FOREST_RASTER_SIZE))
    mask = Image.new("L", image.size, 0)
    _draw_polygon_mask(ImageDraw.Draw(mask), json.loads(item["geom_json"]), bounds, OFFICIAL_FOREST_RASTER_SIZE)
    covered_pixels = mask.histogram()[255]
    if not covered_pixels:
        raise ValueError("Masker konsesi tidak menghasilkan piksel yang dapat dihitung")
    # Let Pillow group identical/anti-aliased colours in C instead of walking
    # ~600k Python pixels per concession.  This matters for the first regional
    # refresh with more than one hundred assets.
    masked = Image.new("RGB", image.size, (0, 0, 0))
    masked.paste(image, mask=mask)
    forest_pixels = 0
    classes: dict[str, int] = {}
    for count, pixel in masked.getcolors(maxcolors=image.width * image.height) or []:
        if pixel == (0, 0, 0):
            continue
        forest_class = _forest_class_from_pixel(*pixel)
        if forest_class:
            forest_pixels += count
            classes[forest_class] = classes.get(forest_class, 0) + count
    ratio = forest_pixels / covered_pixels
    area_ha = round(float(item["konsesi_area_ha"]) * ratio, 4)
    class_ha = {name: round(float(item["konsesi_area_ha"]) * count / covered_pixels, 4) for name, count in classes.items()}
    return area_ha, class_ha


def _refresh_official_forest_cache(items: list[dict[str, Any]]) -> None:
    """Run outside the HTTP response; results are durable and reused by all users."""
    if not items:
        return
    db = SessionLocal()
    try:
        keys = [item["id"] for item in items]
        db.execute(text("""
          UPDATE gis_official_forest_cache SET state='running', updated_at=now(), error_summary=NULL
          WHERE asset_key = ANY(:keys) AND source_key=:source_key
        """), {"keys": keys, "source_key": OFFICIAL_FOREST_SOURCE_KEY})
        db.commit()
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_measure_official_forest, item): item for item in items}
            for future in as_completed(futures):
                item = futures[future]
                try:
                    forest_area_ha, class_breakdown = future.result()
                    db.execute(text("""
                      UPDATE gis_official_forest_cache
                      SET state='complete', forest_area_ha=:forest_area_ha,
                        class_breakdown=CAST(:class_breakdown AS jsonb), error_summary=NULL,
                        measured_at=now(), updated_at=now()
                      WHERE asset_key=:asset_key AND geom_hash=:geom_hash AND source_key=:source_key
                    """), {"asset_key": item["id"], "geom_hash": item["geom_hash"], "source_key": OFFICIAL_FOREST_SOURCE_KEY,
                           "forest_area_ha": forest_area_ha, "class_breakdown": json.dumps(class_breakdown)})
                except Exception as exc:
                    db.execute(text("""
                      UPDATE gis_official_forest_cache
                      SET state='failed', error_summary=:error_summary, updated_at=now()
                      WHERE asset_key=:asset_key AND geom_hash=:geom_hash AND source_key=:source_key
                    """), {"asset_key": item["id"], "geom_hash": item["geom_hash"], "source_key": OFFICIAL_FOREST_SOURCE_KEY,
                           "error_summary": str(exc)[:500]})
                db.commit()
    finally:
        db.close()


def _error(exc: Exception) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


def _official_forest_class(image_bytes: bytes) -> str | None:
    """Classify the centre pixel of the official rendered map.

    The public Kemenhut service exposes Map/export only, not feature/query.
    Its published renderer is therefore the available public source for a
    class at a clicked coordinate.
    """
    image = Image.open(BytesIO(image_bytes)).convert("RGBA")
    centre_x, centre_y = image.width // 2, image.height // 2
    candidates = [image.getpixel((x, y)) for y in range(max(0, centre_y - 1), min(image.height, centre_y + 2)) for x in range(max(0, centre_x - 1), min(image.width, centre_x + 2))]
    for red, green, blue, alpha in candidates:
        if alpha < 32:
            continue
        nearest, function = min(OFFICIAL_FOREST_COLORS.items(), key=lambda item: sum((item[0][index] - (red, green, blue)[index]) ** 2 for index in range(3)))
        distance = sum((nearest[index] - (red, green, blue)[index]) ** 2 for index in range(3))
        if distance <= 100:
            return function
    return None


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
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    filters = ["archived_at IS NULL"]
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
      SELECT d.id, d.kind, d.name, d.scope_key, d.active_version_id, d.revision, d.created_at,
        v.version_no AS active_version_no, v.source_name, v.source_year, v.published_at
      FROM gis_datasets d LEFT JOIN gis_dataset_versions v ON v.id = d.active_version_id
      WHERE {' AND '.join(filters)} ORDER BY d.created_at DESC LIMIT :limit
    """), params).mappings().all()
    return {"data": [dict(row) for row in rows]}


@router.post("/datasets", status_code=201)
def create_dataset(
    body: DatasetCreateBody,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    require_domain(db, user, body.kind)
    try:
        row = db.execute(text("""
          INSERT INTO gis_datasets (kind, name, scope_key, created_by)
          VALUES (:kind, :name, :scope_key, :created_by) RETURNING *
        """), body.model_dump() | {"created_by": user["id"]}).mappings().one()
        db.execute(text("""
          INSERT INTO gis_audit_events (actor_id, event_type, dataset_id, details)
          VALUES (:actor_id, 'dataset_created', :dataset_id, CAST(:details AS jsonb))
        """), {"actor_id": user["id"], "dataset_id": row["id"], "details": json.dumps({"kind": body.kind})})
        db.commit()
        return {"dataset": dict(row)}
    except Exception as exc:
        db.rollback()
        if "gis_datasets_kind_scope_key_key" in str(exc):
            raise HTTPException(status_code=409, detail="Dataset dengan cakupan ini sudah ada") from None
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


@router.get("/datasets/{dataset_id}/imports/latest")
def latest_dataset_import(
    dataset_id: str,
    db: Session = Depends(get_db),
    user: CurrentUser = None,  # type: ignore[assignment]
):
    """Return an import a user can resume, preferring an active draft."""
    dataset = require_dataset_domain(db, user, dataset_id)
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
    user: CurrentUser = None,  # type: ignore[assignment]
):
    imp = db.execute(text("""
      SELECT i.*, d.kind FROM gis_imports i JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id
    """), {"id": import_id}).mappings().first()
    if not imp:
        raise HTTPException(status_code=404, detail="Impor GIS tidak ditemukan")
    require_domain(db, user, imp["kind"])
    table = {
        "konsesi": "gis_konsesi_details", "tanaman": "gis_tanaman_details", "hutan": "gis_hutan_details",
        "opset": "gis_opset_details", "okupasi": "gis_okupasi_details", "administrasi": "gis_administrasi_details",
    }[imp["kind"]]
    rows = db.execute(text(f"""
      SELECT fv.id, fv.name, fv.original_properties, fv.computed_area_m2,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(fv.geom, 0.00001)) AS geometry,
        to_jsonb(d) - 'feature_version_id' AS attributes,
        CASE WHEN :kind='konsesi' THEN coalesce((SELECT array_agg(ka.aset_id::text ORDER BY ka.aset_id::text) FROM gis_konsesi_aset ka WHERE ka.konsesi_feature_version_id=fv.id), ARRAY[]::text[]) ELSE ARRAY[]::text[] END AS linked_asset_ids
      FROM gis_feature_versions fv LEFT JOIN {table} d ON d.feature_version_id=fv.id
      WHERE fv.dataset_version_id=:version_id ORDER BY fv.name LIMIT 500
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


@router.get("/konsesi/summary/grouped")
def list_grouped_konsesi_summaries(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Return one row per source land asset, merging multipart KMZ polygons."""
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
        SELECT md5(concat_ws('|', coalesce(fv.original_properties->>'Kebun', fv.original_properties->>'kebun', ''), coalesce(fv.original_properties->>'FID_Areal', fv.original_properties->>'fid_areal', fv.original_properties->>'Nama_Serti', fv.name))) AS id,
          cv.record_state, d.id AS dataset_id,
          coalesce(max(nullif(kd.nomor_alas_hak, '')), max(nullif(fv.original_properties->>'Nama_Serti', '')), min(fv.name)) AS kode_aset,
          coalesce(max(nullif(fv.original_properties->>'Nama_Serti', '')), regexp_replace(min(fv.name), '\\s+\\(bagian \\d+\\)$', '')) AS nama_aset,
          coalesce(max(nullif(fv.original_properties->>'Kebun', '')), max(nullif(fv.original_properties->>'kebun', '')), '') AS lokasi,
          ST_UnaryUnion(ST_Collect(fv.geom)) AS geom
        FROM konsesi_version cv
        JOIN gis_feature_versions fv ON fv.dataset_version_id=cv.version_id
        JOIN gis_datasets d ON d.id=cv.dataset_id
        LEFT JOIN gis_konsesi_details kd ON kd.feature_version_id=fv.id
        GROUP BY cv.record_state, d.id, coalesce(fv.original_properties->>'Kebun', fv.original_properties->>'kebun', ''), coalesce(fv.original_properties->>'FID_Areal', fv.original_properties->>'fid_areal', fv.original_properties->>'Nama_Serti', fv.name)
      )
      SELECT cg.id, cg.record_state, cg.kode_aset, cg.nama_aset, cg.lokasi,
        1::integer AS konsesi_count, ARRAY[cg.nama_aset]::text[] AS konsesi_names,
        ARRAY[cg.dataset_id::text]::text[] AS dataset_ids,
        concat_ws(',', ST_XMin(Box2D(cg.geom)::box3d), ST_YMin(Box2D(cg.geom)::box3d), ST_XMax(Box2D(cg.geom)::box3d), ST_YMax(Box2D(cg.geom)::box3d)) AS bbox,
        ST_AsGeoJSON(cg.geom) AS geom_json,
        md5(ST_AsEWKB(cg.geom)::text) AS geom_hash,
        round((ST_Area(cg.geom::geography) / 10000)::numeric, 4) AS konsesi_area_ha,
        round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='tanaman'))::geography) / 10000), 0)::numeric, 4) AS tanaman_area_ha,
        CASE WHEN EXISTS (SELECT 1 FROM category_geom WHERE kind='hutan')
          THEN round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='hutan'))::geography) / 10000), 0)::numeric, 4)
          WHEN ofc.state='complete' THEN ofc.forest_area_ha
          ELSE NULL END AS hutan_area_ha,
        round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='okupasi'))::geography) / 10000), 0)::numeric, 4) AS okupasi_area_ha,
        round(coalesce((ST_Area(ST_Intersection(cg.geom, (SELECT geom FROM category_geom WHERE kind='opset'))::geography) / 10000), 0)::numeric, 4) AS kerja_sama_area_ha,
        CASE WHEN EXISTS (SELECT 1 FROM category_geom WHERE kind='hutan')
          THEN round((ST_Area(ST_Difference(cg.geom, coalesce((SELECT geom FROM available_mask), ST_GeomFromText('MULTIPOLYGON EMPTY', 4326)))::geography) / 10000)::numeric, 4)
          WHEN ofc.state='complete' THEN round(GREATEST(0, (ST_Area(ST_Difference(cg.geom, coalesce((SELECT geom FROM available_mask), ST_GeomFromText('MULTIPOLYGON EMPTY', 4326)))::geography) / 10000) - ofc.forest_area_ha)::numeric, 4)
          ELSE NULL END AS dapat_dimanfaatkan_area_ha,
        ofc.state AS official_forest_state
      FROM konsesi_group cg
      LEFT JOIN gis_official_forest_cache ofc
        ON ofc.asset_key=cg.id AND ofc.geom_hash=md5(ST_AsEWKB(cg.geom)::text)
          AND ofc.source_key=:official_forest_source
      ORDER BY cg.lokasi, cg.nama_aset
    """), {"official_forest_source": OFFICIAL_FOREST_SOURCE_KEY}).mappings().all()
    active_kinds = set(db.execute(text("""
      SELECT DISTINCT kind FROM gis_datasets
      WHERE active_version_id IS NOT NULL AND archived_at IS NULL
    """)).scalars().all())
    missing_layers = sorted({"konsesi", "tanaman", "hutan", "opset", "okupasi"} - active_kinds)
    queued_items: list[dict[str, Any]] = []
    if "hutan" not in active_kinds:
        for row in rows:
            item = dict(row)
            if item["official_forest_state"] in {None, "queued"} and item.get("bbox"):
                queued = db.execute(text("""
                  INSERT INTO gis_official_forest_cache (
                    asset_key, geom_hash, source_key, source_year, state, raster_size, updated_at
                  ) VALUES (:asset_key, :geom_hash, :source_key, :source_year, 'running', :raster_size, now())
                  ON CONFLICT (asset_key) DO UPDATE SET
                    geom_hash=EXCLUDED.geom_hash, source_key=EXCLUDED.source_key,
                    source_year=EXCLUDED.source_year, state='running', error_summary=NULL,
                    updated_at=now()
                  WHERE gis_official_forest_cache.geom_hash <> EXCLUDED.geom_hash
                    OR gis_official_forest_cache.source_key <> EXCLUDED.source_key
                    OR gis_official_forest_cache.state='queued'
                  RETURNING asset_key
                """), {"asset_key": item["id"], "geom_hash": item["geom_hash"],
                       "source_key": OFFICIAL_FOREST_SOURCE_KEY, "source_year": OFFICIAL_FOREST_SOURCE_YEAR,
                       "raster_size": OFFICIAL_FOREST_RASTER_SIZE}).scalar_one_or_none()
                if queued:
                    queued_items.append(item)
        if queued_items:
            db.commit()
            background_tasks.add_task(_refresh_official_forest_cache, queued_items)
    result = []
    for row in rows:
        item = dict(row)
        item["konsesi_names"] = item["konsesi_names"] or []
        item["dataset_ids"] = item["dataset_ids"] or []
        for field in ("konsesi_area_ha", "tanaman_area_ha", "hutan_area_ha", "okupasi_area_ha", "kerja_sama_area_ha", "dapat_dimanfaatkan_area_ha"):
            item[field] = float(item[field]) if item[field] is not None else None
        item["missing_layers"] = [kind for kind in missing_layers if not (kind == "hutan" and item["official_forest_state"] == "complete")]
        item["analysis_status"] = (
            "draf — lengkapi informasi sebelum diterbitkan" if item["record_state"] == "draf"
            else "data kawasan hutan sedang dihitung" if item["official_forest_state"] in {"queued", "running"}
            else "estimasi — layer belum lengkap" if item["missing_layers"]
            else "estimasi berdasarkan layer aktif"
        )
        item.pop("geom_json", None)
        item.pop("geom_hash", None)
        result.append(item)
    return {"data": result, "availability_note": "Kawasan hutan dihitung otomatis dari peta Kemenhut skala 1:250.000 (Juni 2026), lalu disimpan per konsesi. Ini merupakan estimasi spasial, bukan keputusan legal."}


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


@router.get("/official-forest/identify")
def identify_official_forest(
    lng: float = Query(..., ge=94.9, le=141.1),
    lat: float = Query(..., ge=-11.1, le=6.1),
    _user: dict[str, Any] = Depends(require_app_read),
):
    """Identify a clicked location in the official Kemenhut national map."""
    delta = 0.00008
    params = {
        "bbox": f"{lng - delta},{lat - delta},{lng + delta},{lat + delta}",
        "bboxSR": "4326", "imageSR": "4326", "size": "9,9", "format": "png32",
        "transparent": "true", "layers": "show:0", "f": "image",
    }
    try:
        response = httpx.get(OFFICIAL_FOREST_EXPORT, params=params, timeout=12.0, follow_redirects=True)
        response.raise_for_status()
        function = _official_forest_class(response.content)
    except (httpx.HTTPError, OSError) as exc:
        raise HTTPException(status_code=502, detail="Referensi kawasan hutan resmi sedang tidak dapat dihubungi") from exc
    return {
        "found": function is not None,
        "function": function,
        "source": "Kementerian Kehutanan — KWSHUTAN_AR_250K_JUN2026",
        "year": 2026,
        "note": "Kelas dibaca dari renderer resmi pada titik yang diklik. Nomor dan tanggal SK per bidang tidak dibuka oleh layanan publik sumber.",
    }


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
    exists = db.execute(text("""
      SELECT id FROM gis_feature_versions WHERE id=:feature_id AND dataset_version_id=:version_id
    """), {"feature_id": feature_id, "version_id": imp["candidate_version_id"]}).scalar_one_or_none()
    if not exists:
        raise HTTPException(status_code=404, detail="Feature draf tidak ditemukan")
    try:
        write_detail(db, imp["kind"], feature_id, body.attributes, user["id"])
        if imp["kind"] == "konsesi" and body.linked_asset_ids is not None:
            db.execute(text("DELETE FROM gis_konsesi_aset WHERE konsesi_feature_version_id=:feature_id"), {"feature_id": feature_id})
            for aset_id in sorted(set(body.linked_asset_ids)):
                db.execute(text("""
                  INSERT INTO gis_konsesi_aset (konsesi_feature_version_id, aset_id, linked_by)
                  VALUES (:feature_id, :aset_id, :actor_id)
                """), {"feature_id": feature_id, "aset_id": aset_id, "actor_id": user["id"]})
        readiness = refresh_import_readiness(db, import_id)
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
        coalesce(
          to_jsonb(kd) - 'feature_version_id', to_jsonb(td) - 'feature_version_id',
          to_jsonb(hd) - 'feature_version_id', to_jsonb(od) - 'feature_version_id',
          to_jsonb(ocd) - 'feature_version_id', to_jsonb(ad) - 'feature_version_id', '{}'::jsonb
        ) AS attributes,
        ST_AsGeoJSON(ST_SimplifyPreserveTopology(fv.geom, 0.00001)) AS geometry
      FROM gis_feature_versions fv
      JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
      JOIN gis_datasets d ON d.id=v.dataset_id
      LEFT JOIN gis_konsesi_details kd ON kd.feature_version_id=fv.id
      LEFT JOIN gis_tanaman_details td ON td.feature_version_id=fv.id
      LEFT JOIN gis_hutan_details hd ON hd.feature_version_id=fv.id
      LEFT JOIN gis_opset_details od ON od.feature_version_id=fv.id
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
      {"type": "Feature", "id": str(row["id"]), "properties": {"feature_id": str(row["feature_id"]), "dataset_id": str(row["dataset_id"]), "name": row["name"], "kind": row["kind"], "computed_area_m2": float(row["computed_area_m2"]), "attributes": row["attributes"] or {}}, "geometry": json.loads(row["geometry"])}
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
