from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session


def claim_job(db: Session):
    row = db.execute(text("""
      WITH candidate AS (
        SELECT id FROM gis_jobs
        WHERE state = 'queued' OR (state = 'running' AND lease_until < now())
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE gis_jobs AS job SET state='running', attempts=attempts+1, lease_token=lease_token+1,
        lease_until=now() + interval '2 minutes', heartbeat_at=now()
      FROM candidate WHERE job.id=candidate.id RETURNING job.*
    """)).mappings().first()
    return dict(row) if row else None


def finish_job(db: Session, job_id: str, lease_token: int, *, error: str | None = None) -> bool:
    state = "failed" if error else "completed"
    row = db.execute(text("""
      UPDATE gis_jobs SET state=:state, progress=100, error_summary=:error, finished_at=now(), lease_until=NULL
      WHERE id=:id AND state='running' AND lease_token=:lease_token RETURNING id
    """), {"id": job_id, "lease_token": lease_token, "state": state, "error": error}).first()
    return row is not None
