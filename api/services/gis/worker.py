from __future__ import annotations

import json
import logging
import time

from database import SessionLocal
from services.gis.importer import GISImportError
from services.gis.analysis import run_overlap_analysis
from services.gis.jobs import claim_job, finish_job
from services.gis.repository import parse_import, report_hash
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def run_once() -> bool:
    db = SessionLocal()
    try:
        job = claim_job(db)
        db.commit()
        if not job:
            return False
        try:
            if job["job_type"] == "import":
                parse_import(db, str(job["subject_id"]))
            elif job["job_type"] == "analysis":
                run_overlap_analysis(db, str(job["subject_id"]))
            else:
                raise GISImportError("Jenis pekerjaan GIS belum didukung worker")
            finish_job(db, str(job["id"]), int(job["lease_token"]))
            db.commit()
        except Exception as exc:
            db.rollback()
            if job["job_type"] == "import":
                error_message = str(exc)[:1000]
                report = {"state": "failed", "error": error_message, "feature_count": 0, "warnings": []}
                db.execute(text("""
                  UPDATE gis_imports SET state='failed', validation_report=CAST(:report AS jsonb),
                    report_hash=:report_hash, updated_at=now() WHERE id=:id
                """), {"id": job["subject_id"], "report": json.dumps(report), "report_hash": report_hash(report)})
            if job["job_type"] == "analysis":
                db.execute(text("UPDATE gis_analysis_runs SET state='failed', finished_at=now() WHERE id=:id"), {"id": job["subject_id"]})
            finish_job(db, str(job["id"]), int(job["lease_token"]), error=str(exc)[:1000])
            db.commit()
            logger.exception("GIS job failed: %s", job["id"])
        return True
    finally:
        db.close()


def main() -> None:
    while True:
        if not run_once():
            time.sleep(2)


if __name__ == "__main__":
    main()
