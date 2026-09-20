"""PostGIS overlap analysis. Warnings describe spatial relationships; they never block publication."""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def run_overlap_analysis(db: Session, run_id: str) -> dict[str, Any]:
    run = db.execute(text("""
      SELECT * FROM gis_analysis_runs WHERE id=:id FOR UPDATE
    """), {"id": run_id}).mappings().first()
    if not run:
        raise ValueError("Analisis GIS tidak ditemukan")
    db.execute(text("UPDATE gis_analysis_runs SET state='running', started_at=now() WHERE id=:id"), {"id": run_id})
    db.execute(text("DELETE FROM gis_analysis_items WHERE run_id=:id"), {"id": run_id})
    rows = db.execute(text("""
      WITH subject AS (
        SELECT id, geom, computed_area_m2 FROM gis_feature_versions WHERE dataset_version_id=:subject_version_id
      ), target AS (
        SELECT fv.id, fv.geom, d.kind
        FROM gis_feature_versions fv
        JOIN gis_dataset_versions v ON v.id=fv.dataset_version_id
        JOIN gis_datasets d ON d.id=v.dataset_id
        WHERE d.active_version_id=fv.dataset_version_id AND fv.dataset_version_id <> :subject_version_id
      )
      SELECT s.id AS subject_id, t.id AS target_id, t.kind,
        round(ST_Area(ST_Intersection(s.geom, t.geom)::geography)::numeric, 2) AS area_m2,
        CASE WHEN s.computed_area_m2 > 0 THEN round((ST_Area(ST_Intersection(s.geom, t.geom)::geography) / s.computed_area_m2 * 100)::numeric, 4) END AS subject_percent
      FROM subject s JOIN target t ON s.geom && t.geom AND ST_Intersects(s.geom, t.geom)
      WHERE ST_Area(ST_Intersection(s.geom, t.geom)::geography) > :tolerance_m2
    """), {"subject_version_id": run["subject_version_id"], "tolerance_m2": run["tolerance_m2"]}).mappings().all()
    for row in rows:
        db.execute(text("""
          INSERT INTO gis_analysis_items (run_id, subject_feature_version_id, target_feature_version_id, relation_kind, intersection_area_m2, subject_percent, warning_code)
          VALUES (:run_id, :subject_id, :target_id, :relation_kind, :area_m2, :subject_percent, :warning_code)
        """), {"run_id": run_id, "subject_id": row["subject_id"], "target_id": row["target_id"], "relation_kind": row["kind"],
               "area_m2": row["area_m2"], "subject_percent": row["subject_percent"], "warning_code": f"overlap_{row['kind']}"})
    totals = {"overlap_count": len(rows), "overlap_area_m2": float(sum(row["area_m2"] for row in rows))}
    db.execute(text("""
      UPDATE gis_analysis_runs SET state='complete', totals=CAST(:totals AS jsonb), finished_at=now() WHERE id=:id
    """), {"id": run_id, "totals": json.dumps(totals)})
    return totals
