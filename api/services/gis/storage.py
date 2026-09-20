from __future__ import annotations

import hashlib
import os
import re
import uuid
from pathlib import Path

from fastapi import UploadFile


MAX_UPLOAD_BYTES = int(os.getenv("GIS_MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
ROOT = Path(os.getenv("GIS_UPLOAD_ROOT", Path(__file__).resolve().parents[2] / "gis-data")).resolve()
ORIGINALS = ROOT / "originals"
STAGING = ROOT / "staging"
ALLOWED = {".kml": "kml", ".kmz": "kmz", ".geojson": "geojson", ".json": "geojson", ".zip": "shapefile_zip", ".gpkg": "gpkg"}


class GISStorageError(ValueError):
    pass


def _safe_filename(name: str) -> str:
    base = Path(name or "upload").name
    return re.sub(r"[^A-Za-z0-9._ -]", "_", base)[:180] or "upload"


def _resolve_inside(root: Path, relative: str) -> Path:
    target = (root / relative).resolve()
    if target != root and root not in target.parents:
        raise GISStorageError("Lokasi file GIS tidak valid")
    return target


async def save_original(upload: UploadFile, version_id: str) -> dict:
    original_name = _safe_filename(upload.filename or "upload")
    ext = Path(original_name).suffix.lower()
    detected = ALLOWED.get(ext)
    if not detected:
        raise GISStorageError("Format belum didukung. Gunakan KML, KMZ, GeoJSON, ZIP Shapefile, atau GeoPackage.")

    target_dir = ORIGINALS / str(version_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4()}{ext}"
    target = _resolve_inside(ORIGINALS, f"{version_id}/{storage_name}")
    digest = hashlib.sha256()
    size = 0
    try:
        with target.open("xb") as out:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise GISStorageError(f"Ukuran file melebihi {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
                digest.update(chunk)
                out.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()
    return {
        "original_name": original_name,
        "storage_key": f"{version_id}/{storage_name}",
        "sha256": digest.hexdigest(),
        "bytes": size,
        "detected_format": detected,
    }


def source_path(storage_key: str) -> Path:
    path = _resolve_inside(ORIGINALS, storage_key)
    if not path.is_file():
        raise GISStorageError("File sumber GIS tidak ditemukan")
    return path
