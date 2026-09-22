from __future__ import annotations

import json
import re
from hashlib import sha256
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from services.gis.importer import GISImportError, parse_source
from services.gis.storage import source_path


DETAIL_TABLES = {
    "konsesi": "gis_konsesi_details",
    "tanaman": "gis_tanaman_details",
    "hutan": "gis_hutan_details",
    "opset": "gis_opset_details",
    "okupasi": "gis_okupasi_details",
    "administrasi": "gis_administrasi_details",
}


def _first_property(props: dict[str, Any], *names: str) -> Any:
    """Find a source property without requiring exact field capitalization."""
    normalized = {str(key).strip().lower(): value for key, value in props.items()}
    for name in names:
        value = normalized.get(name)
        if value not in (None, ""):
            return value
    return None


def _normalise_hutan_function(value: Any) -> str | None:
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    aliases = {
        "hl": "Hutan Lindung", "hutan lindung": "Hutan Lindung",
        "hp": "Hutan Produksi", "hutan produksi": "Hutan Produksi",
        "hpt": "Hutan Produksi Terbatas", "hutan produksi terbatas": "Hutan Produksi Terbatas",
        "hk": "Hutan Konservasi", "hutan konservasi": "Hutan Konservasi",
        "hpk": "Hutan Produksi yang dapat Dikonversi", "hutan produksi yang dapat dikonversi": "Hutan Produksi yang dapat Dikonversi",
        "apl": "Areal Penggunaan Lain", "areal penggunaan lain": "Areal Penggunaan Lain",
    }
    return aliases.get(raw.casefold(), raw)


# Names found in KML/KMZ ExtendedData and common GIS exports are rarely
# identical to our business-field names. Keep recognition in the API so every
# import route gets the same safe prefill.
FIELD_ALIASES: dict[str, dict[str, tuple[str, ...]]] = {
    "konsesi": {
        "nomor_alas_hak": ("nomor_alas_hak", "no_alas_hak", "nomor_hak", "no_hak", "nomor", "no"),
        "jenis_alas_hak": ("jenis_alas_hak", "jenis_hak", "jenis", "tipe_hak"),
        "declared_area_m2": ("declared_area_m2", "luas_dokumen", "luas_m2", "luas", "area_m2", "luas_serti"),
        "tanggal_terbit": ("tanggal_terbit", "tgl_terbit", "terbit", "issue_date"),
        "expiry_mode": ("expiry_mode", "masa_berlaku", "status_berlaku"),
        "tanggal_berakhir": ("tanggal_berakhir", "tgl_berakhir", "berakhir", "expiry_date"),
    },
    "tanaman": {
        "unit_kebun": ("unit_kebun", "unit", "kebun", "estate"),
        "kode_blok": ("kode_blok", "blok", "block", "kode"),
        "komoditas": ("komoditas", "commodity", "tanaman"),
        "tahun_tanam": ("tahun_tanam", "tahun", "planting_year"),
        "declared_area_m2": ("declared_area_m2", "luas_dokumen", "luas_m2", "luas", "area_m2"),
    },
    "hutan": {
        "fungsi_asli": ("fungsi_asli", "fungsi", "fungsi_kawasan", "status_kawasan", "status"),
        "sumber": ("sumber", "source", "instansi"),
        "tahun": ("tahun", "tahun_data", "year"),
        "nomor_sk": ("nomor_sk", "no_sk", "sk"),
        "tanggal_sk": ("tanggal_sk", "tgl_sk", "tanggal"),
    },
    "okupasi": {
        "pihak_pengokupasi": ("pihak_pengokupasi", "pengokupasi", "pihak", "occupant"),
        "declared_area_m2": ("declared_area_m2", "luas_dokumen", "luas_m2", "luas", "area_m2"),
        "catatan": ("catatan", "keterangan", "notes"),
    },
    "administrasi": {
        "level": ("level", "tingkat", "admin_level"),
        "region_code": ("region_code", "kode_wilayah", "kode", "code"),
        "region_name": ("region_name", "nama_wilayah", "nama", "name"),
        "parent_code": ("parent_code", "kode_induk", "parent"),
        "sumber": ("sumber", "source", "instansi"),
        "tahun": ("tahun", "tahun_data", "year"),
    },
}


def _automatic_attributes(kind: str, props: dict[str, Any]) -> dict[str, Any]:
    """Extract known metadata without inventing values that a user must supply."""
    attrs = {
        field: _first_property(props, *aliases)
        for field, aliases in FIELD_ALIASES.get(kind, {}).items()
    }
    attrs = {field: value for field, value in attrs.items() if value not in (None, "")}
    if kind == "hutan":
        attrs["fungsi_normalized"] = _normalise_hutan_function(attrs.get("fungsi_asli"))
    if kind == "konsesi":
        certificate_name = _first_property(props, "nama_serti", "nama_sertifikat", "nama_hak")
        if certificate_name:
            match = re.match(r"^\s*([A-Za-z]+)\s+([0-9][0-9A-Za-z/.-]*)", str(certificate_name))
            if match:
                attrs.setdefault("jenis_alas_hak", match.group(1).upper())
                attrs.setdefault("nomor_alas_hak", match.group(2))
        area = attrs.get("declared_area_m2")
        if area:
            raw = re.sub(r"\s*(?:ha|hektar)\s*$", "", str(area), flags=re.IGNORECASE).strip()
            # Source tables use Indonesian numeric notation: dots group the
            # thousands and commas mark decimals. Convert hectares to m².
            try:
                number = float(raw.replace(".", "").replace(",", ".")) if "," in raw else float(raw.replace(".", ""))
                attrs["declared_area_m2"] = round(number * 10_000, 2)
            except ValueError:
                attrs.pop("declared_area_m2", None)
    return {field: value for field, value in attrs.items() if value not in (None, "")}


def report_hash(value: dict[str, Any]) -> str:
    return sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def dataset_row(db: Session, dataset_id: str) -> dict[str, Any]:
    row = db.execute(text("SELECT * FROM gis_datasets WHERE id = :id"), {"id": dataset_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset GIS tidak ditemukan")
    return dict(row)


def version_row(db: Session, version_id: str) -> dict[str, Any]:
    row = db.execute(text("SELECT * FROM gis_dataset_versions WHERE id = :id"), {"id": version_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Versi GIS tidak ditemukan")
    return dict(row)


def create_draft_version(db: Session, dataset: dict[str, Any], user_id: str) -> dict[str, Any]:
    version_no = db.execute(
        text("SELECT coalesce(max(version_no), 0) + 1 FROM gis_dataset_versions WHERE dataset_id = :dataset_id"),
        {"dataset_id": dataset["id"]},
    ).scalar_one()
    row = db.execute(text("""
        INSERT INTO gis_dataset_versions (dataset_id, version_no, state, based_on_version_id, created_by)
        VALUES (:dataset_id, :version_no, 'draft', :based_on_version_id, :created_by)
        RETURNING *
    """), {
        "dataset_id": dataset["id"], "version_no": version_no,
        "based_on_version_id": dataset["active_version_id"], "created_by": user_id,
    }).mappings().one()
    return dict(row)


def parse_import(db: Session, import_id: str) -> dict[str, Any]:
    imp = db.execute(text("SELECT * FROM gis_imports WHERE id = :id FOR UPDATE"), {"id": import_id}).mappings().first()
    if not imp:
        raise GISImportError("Impor GIS tidak ditemukan")
    source = db.execute(text("SELECT * FROM gis_source_files WHERE version_id = :version_id ORDER BY uploaded_at DESC LIMIT 1"), {"version_id": imp["candidate_version_id"]}).mappings().first()
    if not source:
        raise GISImportError("File sumber GIS tidak ditemukan")
    version = version_row(db, str(imp["candidate_version_id"]))
    dataset = dataset_row(db, str(version["dataset_id"]))
    if imp["state"] in {"cancelled", "expired", "published"}:
        raise GISImportError("Impor tidak lagi dapat diproses")

    features = parse_source(source_path(source["storage_key"]), source["detected_format"])
    db.execute(text("DELETE FROM gis_feature_versions WHERE dataset_version_id = :version_id"), {"version_id": version["id"]})
    seen: set[str] = set()
    for index, feature in enumerate(features, start=1):
        external_key = feature["external_key"][:180] or str(index)
        if external_key in seen:
            external_key = f"{external_key}-{index}"
        seen.add(external_key)
        feature_id = db.execute(text("""
            INSERT INTO gis_features (dataset_id, external_key)
            VALUES (:dataset_id, :external_key)
            ON CONFLICT (dataset_id, external_key) DO UPDATE SET external_key = EXCLUDED.external_key
            RETURNING id
        """), {"dataset_id": dataset["id"], "external_key": external_key}).scalar_one()
        db.execute(text("""
            INSERT INTO gis_feature_versions (dataset_version_id, feature_id, name, geom, original_properties)
            VALUES (
              :version_id, :feature_id, :name,
              ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(CAST(:geometry AS json)), 4326)), 3)),
              CAST(:properties AS jsonb)
            )
        """), {
            "version_id": version["id"], "feature_id": feature_id, "name": feature["name"],
            "geometry": json.dumps(feature["geometry"]), "properties": json.dumps(feature["properties"]),
        })
    # Populate what the source already contains. The remaining fields stay
    # empty and are reported to the review UI as required metadata.
    # The import is created as `uploaded`; move it to the mapping state before
    # applying automatic attributes so an OPSET/occupation draft can reach the
    # metadata review instead of failing before it is displayed.
    db.execute(text("UPDATE gis_imports SET state='mapping_required', updated_at=now() WHERE id=:id"), {"id": import_id})
    return apply_mapping(db, import_id, {"source_crs": "EPSG:4326", "auto_detected": True})


def _value(props: dict, mapping: dict, field: str):
    source = mapping.get(field)
    return props.get(source) if source else None


def write_detail(db: Session, kind: str, feature_version_id: str, attributes: dict[str, Any], actor_id: str | None = None) -> None:
    if kind == "konsesi":
        db.execute(text("""
          INSERT INTO gis_konsesi_details (feature_version_id, nomor_alas_hak, jenis_alas_hak, declared_area_m2, tanggal_terbit, expiry_mode, tanggal_berakhir, incomplete_reason)
          VALUES (:id, :nomor, :jenis, :luas, :terbit, :mode, :berakhir, :reason)
          ON CONFLICT (feature_version_id) DO UPDATE SET nomor_alas_hak = EXCLUDED.nomor_alas_hak, jenis_alas_hak = EXCLUDED.jenis_alas_hak,
            declared_area_m2 = EXCLUDED.declared_area_m2, tanggal_terbit = EXCLUDED.tanggal_terbit, expiry_mode = EXCLUDED.expiry_mode,
            tanggal_berakhir = EXCLUDED.tanggal_berakhir, incomplete_reason = EXCLUDED.incomplete_reason
        """), {"id": feature_version_id, "nomor": attributes.get("nomor_alas_hak"), "jenis": attributes.get("jenis_alas_hak"), "luas": attributes.get("declared_area_m2"), "terbit": attributes.get("tanggal_terbit"), "mode": attributes.get("expiry_mode", "unknown"), "berakhir": attributes.get("tanggal_berakhir"), "reason": attributes.get("incomplete_reason")})
    elif kind == "tanaman":
        db.execute(text("""
          INSERT INTO gis_tanaman_details (feature_version_id, kode_blok, unit_kebun, komoditas, tahun_tanam, declared_area_m2, incomplete_reason)
          VALUES (:id, :kode, :unit, :komoditas, :tahun, :luas, :reason)
          ON CONFLICT (feature_version_id) DO UPDATE SET kode_blok=EXCLUDED.kode_blok, unit_kebun=EXCLUDED.unit_kebun, komoditas=EXCLUDED.komoditas,
            tahun_tanam=EXCLUDED.tahun_tanam, declared_area_m2=EXCLUDED.declared_area_m2, incomplete_reason=EXCLUDED.incomplete_reason
        """), {"id": feature_version_id, "kode": attributes.get("kode_blok"), "unit": attributes.get("unit_kebun"), "komoditas": attributes.get("komoditas"), "tahun": attributes.get("tahun_tanam"), "luas": attributes.get("declared_area_m2"), "reason": attributes.get("incomplete_reason")})
    elif kind == "hutan":
        db.execute(text("""
          INSERT INTO gis_hutan_details (feature_version_id, fungsi_asli, fungsi_normalized, sumber, tahun, nomor_sk, tanggal_sk, scale_denominator, status_validasi)
          VALUES (:id, :asli, :normal, :sumber, :tahun, :sk, :tanggal_sk, :scale, :status)
          ON CONFLICT (feature_version_id) DO UPDATE SET fungsi_asli=EXCLUDED.fungsi_asli, fungsi_normalized=EXCLUDED.fungsi_normalized,
            sumber=EXCLUDED.sumber, tahun=EXCLUDED.tahun, nomor_sk=EXCLUDED.nomor_sk, tanggal_sk=EXCLUDED.tanggal_sk,
            scale_denominator=EXCLUDED.scale_denominator, status_validasi=EXCLUDED.status_validasi
        """), {"id": feature_version_id, "asli": attributes.get("fungsi_asli"), "normal": attributes.get("fungsi_normalized"), "sumber": attributes.get("sumber") or "Belum diisi", "tahun": attributes.get("tahun"), "sk": attributes.get("nomor_sk"), "tanggal_sk": attributes.get("tanggal_sk"), "scale": attributes.get("scale_denominator"), "status": attributes.get("status_validasi", "indikatif")})
    elif kind == "opset":
        if not attributes.get("kerja_sama_id"):
            raise GISImportError("Area OPSET wajib dihubungkan ke data kerja sama")
        db.execute(text("""
          INSERT INTO gis_opset_details (feature_version_id, kerja_sama_id) VALUES (:id, :ks_id)
          ON CONFLICT (feature_version_id) DO UPDATE SET kerja_sama_id = EXCLUDED.kerja_sama_id
        """), {"id": feature_version_id, "ks_id": attributes["kerja_sama_id"]})
    elif kind == "okupasi":
        db.execute(text("""
          INSERT INTO gis_okupasi_details (feature_version_id, pihak_pengokupasi, declared_area_m2, catatan, incomplete_reason)
          VALUES (:id, :pihak, :luas, :catatan, :reason)
          ON CONFLICT (feature_version_id) DO UPDATE SET pihak_pengokupasi=EXCLUDED.pihak_pengokupasi,
            declared_area_m2=EXCLUDED.declared_area_m2, catatan=EXCLUDED.catatan, incomplete_reason=EXCLUDED.incomplete_reason
        """), {"id": feature_version_id, "pihak": attributes.get("pihak_pengokupasi"), "luas": attributes.get("declared_area_m2"), "catatan": attributes.get("catatan"), "reason": attributes.get("incomplete_reason")})
    elif kind == "administrasi":
        db.execute(text("""
          INSERT INTO gis_administrasi_details (feature_version_id, level, region_code, region_name, parent_code, code_system, sumber, tahun, status_batas)
          VALUES (:id, :level, :code, :name, :parent, :system, :sumber, :tahun, :status)
          ON CONFLICT (feature_version_id) DO UPDATE SET level=EXCLUDED.level, region_code=EXCLUDED.region_code, region_name=EXCLUDED.region_name,
            parent_code=EXCLUDED.parent_code, code_system=EXCLUDED.code_system, sumber=EXCLUDED.sumber, tahun=EXCLUDED.tahun, status_batas=EXCLUDED.status_batas
        """), {"id": feature_version_id, "level": attributes.get("level") or "desa_kelurahan", "code": attributes.get("region_code") or feature_version_id,
            "name": attributes.get("region_name") or "Belum dinamai", "parent": attributes.get("parent_code"), "system": attributes.get("code_system"),
            "sumber": attributes.get("sumber") or "Belum diisi", "tahun": attributes.get("tahun"), "status": attributes.get("status_batas", "indikatif")})


def refresh_import_readiness(db: Session, import_id: str) -> dict[str, Any]:
    """Validate the minimum business attributes before a draft can be published."""
    imp = db.execute(text("""
      SELECT i.*, d.kind FROM gis_imports i
      JOIN gis_datasets d ON d.id=i.dataset_id WHERE i.id=:id FOR UPDATE
    """), {"id": import_id}).mappings().one()
    feature_rows = db.execute(text("""
      SELECT id, name FROM gis_feature_versions WHERE dataset_version_id=:version_id ORDER BY name
    """), {"version_id": imp["candidate_version_id"]}).mappings().all()
    missing: list[dict[str, str]] = []
    detail_by_feature: dict[str, dict[str, Any]] = {}
    table = DETAIL_TABLES[imp["kind"]]
    rows = db.execute(text(f"SELECT * FROM {table} WHERE feature_version_id IN (SELECT id FROM gis_feature_versions WHERE dataset_version_id=:version_id)"), {"version_id": imp["candidate_version_id"]}).mappings().all()
    detail_by_feature = {str(row["feature_version_id"]): dict(row) for row in rows}
    rules: dict[str, tuple[str, ...]] = {
        # The source cadastral KMZ commonly contains the certificate number
        # and certified area but not its historic issue date.  Geometry may
        # be published once those core identifiers are confirmed; the date is
        # retained as an optional metadata field to complete later.
        "konsesi": ("nomor_alas_hak", "jenis_alas_hak", "declared_area_m2", "expiry_mode"),
        "tanaman": ("unit_kebun", "komoditas", "tahun_tanam", "declared_area_m2"),
        "hutan": ("fungsi_normalized", "sumber", "tahun"),
        "opset": ("kerja_sama_id",),
        "okupasi": ("pihak_pengokupasi", "declared_area_m2"),
        "administrasi": ("level", "region_code", "region_name", "sumber", "tahun"),
    }
    for feature in feature_rows:
        detail = detail_by_feature.get(str(feature["id"]), {})
        absent = [field for field in rules[imp["kind"]] if detail.get(field) is None or detail.get(field) in {"", "Belum diisi", "Belum dinamai"}]
        if detail.get("expiry_mode") == "fixed" and not detail.get("tanggal_berakhir"):
            absent.append("tanggal_berakhir")
        if absent:
            missing.append({"feature_id": str(feature["id"]), "name": feature["name"], "fields": ", ".join(absent)})
    state = "ready" if not missing else "mapping_required"
    # The review screen needs every incomplete feature, not an arbitrary first
    # page. The UI keeps the list scrollable/searchable, so this remains usable
    # even for large imports.
    report = {"feature_count": len(feature_rows), "warnings": [], "missing_attributes": missing, "state": state}
    digest = report_hash(report)
    db.execute(text("""
      UPDATE gis_imports SET state=:state, validation_report=CAST(:report AS jsonb), report_hash=:hash,
        draft_revision=draft_revision+1, updated_at=now() WHERE id=:id
    """), {"id": import_id, "state": state, "report": json.dumps(report), "hash": digest})
    return report | {"report_hash": digest, "draft_revision": imp["draft_revision"] + 1}


def apply_mapping(db: Session, import_id: str, mapping: dict[str, Any]) -> dict:
    imp = db.execute(text("SELECT * FROM gis_imports WHERE id = :id FOR UPDATE"), {"id": import_id}).mappings().first()
    if not imp or imp["state"] not in {"mapping_required", "ready"}:
        raise GISImportError("Impor belum siap dipetakan")
    version = version_row(db, str(imp["candidate_version_id"]))
    dataset = dataset_row(db, str(version["dataset_id"]))
    selected = set(mapping.get("selected_feature_ids") or [])
    property_mapping = mapping.get("property_mapping") or {}
    rows = db.execute(text("SELECT id, original_properties FROM gis_feature_versions WHERE dataset_version_id = :version_id"), {"version_id": version["id"]}).mappings().all()
    selected_rows = [row for row in rows if not selected or str(row["id"]) in selected]
    if not selected_rows:
        raise GISImportError("Pilih minimal satu feature polygon")
    for row in selected_rows:
        props = row["original_properties"] or {}
        attrs = _automatic_attributes(dataset["kind"], props)
        attrs.update(mapping.get("default_attributes") or {})
        attrs.update({field: _value(props, property_mapping, field) for field in property_mapping})
        if dataset["kind"] == "hutan" and not attrs.get("fungsi_normalized"):
            source_function = _first_property(props, "fungsi_normalized", "fungsi", "fungsi_kawasan", "status_kawasan", "status")
            attrs["fungsi_asli"] = source_function
            attrs["fungsi_normalized"] = _normalise_hutan_function(source_function)
        if dataset["kind"] == "opset" and not attrs.get("kerja_sama_id"):
            # An OPSET feature cannot be persisted until it is linked to a
            # legal agreement; leaving it absent keeps the draft incomplete.
            continue
        write_detail(db, dataset["kind"], str(row["id"]), attrs)
    report = refresh_import_readiness(db, import_id)
    db.execute(text("""
      UPDATE gis_imports SET mapping=CAST(:mapping AS jsonb),
        crs_decision=CAST(:crs AS jsonb), updated_at=now()
      WHERE id=:id
    """), {"id": import_id, "mapping": json.dumps(mapping), "crs": json.dumps({"source_crs": mapping.get("source_crs")})})
    return report
