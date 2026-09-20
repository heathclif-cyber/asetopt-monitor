"""Bounded parsers for the first GIS import delivery.

KML/KMZ and GeoJSON are normalised server-side. GDAL-backed Shapefile and
GeoPackage handling is enabled by the worker only after their drivers are
available in the deployment image.
"""
from __future__ import annotations

import json
import math
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from html import unescape
from pathlib import Path
from typing import Any


class GISImportError(ValueError):
    pass


# KML exported by some desktop GIS tools contains Google/Atom extension tags
# but omits their namespace declaration. ElementTree correctly rejects that as
# malformed XML; supplying only the well-known missing declarations lets us
# safely read the ordinary Polygon content without executing any XML feature.
_COMMON_KML_NAMESPACES = {
    b"gx": b"http://www.google.com/kml/ext/2.2",
    b"atom": b"http://www.w3.org/2005/Atom",
    b"xal": b"urn:oasis:names:tc:ciq:xsdschema:xAL:2.0",
    b"xsi": b"http://www.w3.org/2001/XMLSchema-instance",
}


def _repair_common_kml_namespaces(content: bytes) -> bytes:
    additions: list[bytes] = []
    for prefix, uri in _COMMON_KML_NAMESPACES.items():
        used = re.search(rb"(?<![\w-])" + re.escape(prefix) + rb":", content)
        declared = re.search(rb"xmlns:" + re.escape(prefix) + rb"\s*=", content)
        if used and not declared:
            additions.append(b' xmlns:' + prefix + b'="' + uri + b'"')
    if not additions:
        return content
    return re.sub(
        rb"(<(?:[A-Za-z_][\w.-]*:)?kml\b[^>]*)(>)",
        lambda match: match.group(1) + b"".join(additions) + match.group(2),
        content,
        count=1,
    )


def _finite_position(position: Any) -> bool:
    return isinstance(position, list) and len(position) >= 2 and all(isinstance(v, (int, float)) and math.isfinite(v) for v in position[:2]) and -180 <= position[0] <= 180 and -90 <= position[1] <= 90


def _normalise_geometry(geometry: dict[str, Any]) -> dict[str, Any] | None:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates")
    if geometry_type == "Polygon":
        if not isinstance(coordinates, list) or not all(isinstance(ring, list) and len(ring) >= 4 and all(_finite_position(position) for position in ring) for ring in coordinates):
            raise GISImportError("Polygon GeoJSON tidak valid")
        return {"type": "MultiPolygon", "coordinates": [coordinates]}
    if geometry_type == "MultiPolygon":
        if not isinstance(coordinates, list) or not all(isinstance(polygon, list) and all(isinstance(ring, list) and len(ring) >= 4 and all(_finite_position(position) for position in ring) for ring in polygon) for polygon in coordinates):
            raise GISImportError("MultiPolygon GeoJSON tidak valid")
        return {"type": "MultiPolygon", "coordinates": coordinates}
    return None


def parse_geojson(content: bytes) -> list[dict[str, Any]]:
    try:
        value = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise GISImportError("GeoJSON tidak valid") from exc
    if value.get("type") == "FeatureCollection":
        raw_features = value.get("features", [])
    elif value.get("type") == "Feature":
        raw_features = [value]
    else:
        raw_features = [{"type": "Feature", "properties": {}, "geometry": value}]

    features = []
    for index, feature in enumerate(raw_features, start=1):
        if not isinstance(feature, dict):
            raise GISImportError("Feature GeoJSON tidak valid")
        geometry = _normalise_geometry(feature.get("geometry") or {})
        if geometry is None:
            continue
        properties = feature.get("properties") or {}
        if not isinstance(properties, dict):
            properties = {}
        external_key = str(feature.get("id") or properties.get("id") or properties.get("kode") or index)
        name = str(properties.get("name") or properties.get("nama") or external_key)
        features.append({"external_key": external_key, "name": name[:500], "geometry": geometry, "properties": properties})
    if not features:
        raise GISImportError("File tidak memiliki Polygon atau MultiPolygon yang dapat diimpor")
    return features


def _coordinates(text: str | None) -> list[list[float]]:
    output: list[list[float]] = []
    for raw in (text or "").strip().split():
        parts = raw.split(",")
        if len(parts) < 2:
            continue
        try:
            lng, lat = float(parts[0]), float(parts[1])
        except ValueError as exc:
            raise GISImportError("Koordinat KML tidak valid") from exc
        if not _finite_position([lng, lat]):
            raise GISImportError("Koordinat KML berada di luar rentang WGS84")
        output.append([lng, lat])
    return output


def _description_properties(description: str | None) -> dict[str, str]:
    """Read the key/value table that Google Earth stores in a Description.

    ArcGIS exports frequently put all feature attributes in this HTML table
    rather than ExtendedData.  It is source data, not display markup, so keep
    only plain text key/value pairs.
    """
    output: dict[str, str] = {}
    if not description:
        return output
    for left, right in re.findall(r"<tr[^>]*>\s*<td[^>]*>(.*?)</td>\s*<td[^>]*>(.*?)</td>\s*</tr>", description, flags=re.IGNORECASE | re.DOTALL):
        clean = lambda value: re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", value))).strip()
        key, value = clean(left), clean(right)
        if key and value:
            output[key] = value
    return output


def parse_kml(content: bytes) -> list[dict[str, Any]]:
    if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        raise GISImportError("KML dengan DTD atau entity tidak diizinkan")
    try:
        root = ET.fromstring(_repair_common_kml_namespaces(content))
    except ET.ParseError as exc:
        raise GISImportError("KML tidak valid") from exc
    features: list[dict[str, Any]] = []
    for index, placemark in enumerate(root.findall(".//{*}Placemark"), start=1):
        polygons = []
        for polygon in placemark.findall(".//{*}Polygon"):
            rings = []
            for ring in polygon.findall(".//{*}LinearRing"):
                points = _coordinates(ring.findtext("{*}coordinates"))
                if len(points) >= 4:
                    rings.append(points)
            if rings:
                polygons.append(rings)
        # Google Earth can export an area as a closed LineString instead of a
        # Polygon. Accept only lines that explicitly return to their starting
        # coordinate; open survey lines remain excluded rather than silently
        # becoming an area.
        line_polygons = []
        if not polygons:
            for line in placemark.findall(".//{*}LineString"):
                points = _coordinates(line.findtext("{*}coordinates"))
                if len(points) >= 4 and points[0] == points[-1]:
                    line_polygons.append([points])
        if not polygons and not line_polygons:
            continue
        name = placemark.findtext("{*}name") or f"Area {index}"
        external_key = placemark.get("id") or str(index)
        properties: dict[str, str] = {"name": name.strip()}
        # Preserve ExtendedData so common fields such as "fungsi" can be
        # prefilled on the review screen after a KML/KMZ import.
        for data in placemark.findall(".//{*}Data"):
            key = (data.get("name") or "").strip()
            value = (data.findtext("{*}value") or "").strip()
            if key and value:
                properties[key] = value
        for data in placemark.findall(".//{*}SimpleData"):
            key = (data.get("name") or "").strip()
            value = (data.text or "").strip()
            if key and value:
                properties[key] = value
        # Google Earth preserves ArcGIS attributes as an HTML table inside
        # Description instead of ExtendedData.  Read it before asking a user
        # for fields that are already in the KMZ.
        properties.update(_description_properties(placemark.findtext("{*}description")))
        # Keep independently exported closed lines as individual features.
        # Combining touching areas into one MultiPolygon makes otherwise valid
        # cadastral rings invalid in PostGIS.
        geometry_sets = [polygons] if polygons else [[polygon] for polygon in line_polygons]
        for geometry_index, geometry in enumerate(geometry_sets, start=1):
            suffix = f"-{geometry_index}" if len(geometry_sets) > 1 else ""
            features.append({
                "external_key": f"{external_key}{suffix}",
                "name": (f"{name.strip()} (bagian {geometry_index})" if len(geometry_sets) > 1 else name.strip())[:500],
                "geometry": {"type": "MultiPolygon", "coordinates": geometry},
                "properties": properties,
            })
    if not features:
        raise GISImportError("KML tidak memiliki Polygon yang dapat diimpor")
    return features


def parse_source(path: Path, detected_format: str) -> list[dict[str, Any]]:
    content = path.read_bytes()
    if detected_format == "geojson":
        return parse_geojson(content)
    if detected_format == "kml":
        return parse_kml(content)
    if detected_format == "kmz":
        try:
            with zipfile.ZipFile(path) as archive:
                names = [name for name in archive.namelist() if not name.endswith("/")]
                if len(names) > 1000 or any(".." in Path(name).parts or Path(name).is_absolute() for name in names):
                    raise GISImportError("Arsip KMZ tidak aman")
                candidates = [name for name in names if name.lower() == "doc.kml"] or [name for name in names if name.lower().endswith(".kml")]
                if len(candidates) != 1:
                    raise GISImportError("KMZ harus memuat satu dokumen KML yang dipilih")
                return parse_kml(archive.read(candidates[0]))
        except zipfile.BadZipFile as exc:
            raise GISImportError("KMZ tidak valid") from exc
    if detected_format in {"shapefile_zip", "gpkg"}:
        return parse_gdal_vector(path, detected_format)
    raise GISImportError("Format GIS tidak dikenali")


def parse_gdal_vector(path: Path, detected_format: str) -> list[dict[str, Any]]:
    """Normalize one polygon layer using the GDAL binaries in the worker image."""
    if not shutil.which("ogr2ogr"):
        raise GISImportError("Worker GDAL tidak tersedia untuk format ini")
    with tempfile.TemporaryDirectory(prefix="asetopt-gis-") as temporary:
        source = path
        if detected_format == "shapefile_zip":
            root = Path(temporary)
            try:
                with zipfile.ZipFile(path) as archive:
                    names = [name for name in archive.namelist() if not name.endswith("/")]
                    if len(names) > 1000 or any(".." in Path(name).parts or Path(name).is_absolute() for name in names):
                        raise GISImportError("Arsip Shapefile tidak aman")
                    archive.extractall(root)
            except zipfile.BadZipFile as exc:
                raise GISImportError("ZIP Shapefile tidak valid") from exc
            shapefiles = list(root.rglob("*.shp"))
            if len(shapefiles) != 1:
                raise GISImportError("ZIP harus berisi tepat satu file .shp")
            source = shapefiles[0]
        try:
            result = subprocess.run(
                ["ogr2ogr", "-f", "GeoJSON", "/vsistdout/", str(source), "-t_srs", "EPSG:4326"],
                capture_output=True, check=False, timeout=90,
            )
        except subprocess.TimeoutExpired as exc:
            raise GISImportError("Konversi GIS melebihi batas waktu") from exc
        if result.returncode != 0:
            message = result.stderr.decode("utf-8", "replace").strip().splitlines()
            raise GISImportError(f"GDAL tidak dapat membaca berkas: {message[-1] if message else 'format tidak valid'}")
        return parse_geojson(result.stdout)
