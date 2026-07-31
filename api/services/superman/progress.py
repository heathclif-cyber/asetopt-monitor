"""Pelacakan progres job deklarasi Superman (in-memory)."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

JobStatus = Literal["pending", "running", "completed", "failed"]
JobExecutor = Literal["server", "agent"]

ProgressCallback = Callable[[int, str], None]

TTL_SECONDS = 3600


@dataclass
class SupermanJob:
    job_id: str
    kompensasi_id: str
    status: JobStatus = "pending"
    percent: int = 0
    stage: str = "Menunggu..."
    result: dict[str, Any] | None = None
    error: str | None = None
    executor: JobExecutor = "server"
    claimed_by: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


_jobs: dict[str, SupermanJob] = {}
_lock = threading.Lock()


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [job_id for job_id, job in _jobs.items() if now - job.updated_at > TTL_SECONDS]
        for job_id in expired:
            _jobs.pop(job_id, None)


def create_job(kompensasi_id: str, *, executor: JobExecutor = "server") -> str:
    _cleanup_expired()
    job_id = str(uuid.uuid4())
    stage = "Menunggu agent lokal..." if executor == "agent" else "Menunggu..."
    with _lock:
        _jobs[job_id] = SupermanJob(
            job_id=job_id,
            kompensasi_id=kompensasi_id.strip(),
            executor=executor,
            stage=stage,
        )
    return job_id


def update_job(job_id: str, percent: int, stage: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "running"
        job.percent = max(0, min(100, percent))
        job.stage = stage
        job.updated_at = time.time()


def complete_job(job_id: str, result: dict[str, Any]) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "completed"
        job.percent = 100
        job.stage = "Selesai"
        job.result = result
        job.error = None
        job.updated_at = time.time()


def fail_job(job_id: str, error: str) -> None:
    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return
        job.status = "failed"
        job.error = error
        job.updated_at = time.time()


def get_job(job_id: str) -> SupermanJob | None:
    _cleanup_expired()
    with _lock:
        return _jobs.get(job_id)


def claim_next_agent_job(agent_id: str) -> SupermanJob | None:
    """Ambil job agent tertua yang masih pending."""
    _cleanup_expired()
    aid = (agent_id or "").strip() or "agent"
    with _lock:
        candidates = [
            j
            for j in _jobs.values()
            if j.executor == "agent" and j.status == "pending" and not j.claimed_by
        ]
        if not candidates:
            return None
        candidates.sort(key=lambda j: j.created_at)
        job = candidates[0]
        job.claimed_by = aid
        job.status = "running"
        job.percent = 1
        job.stage = f"Agent {aid} mengambil job..."
        job.updated_at = time.time()
        return job


def make_progress_callback(job_id: str) -> ProgressCallback:
    def _report(percent: int, stage: str) -> None:
        update_job(job_id, percent, stage)

    return _report


def job_to_public(job: SupermanJob) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "job_id": job.job_id,
        "kompensasi_id": job.kompensasi_id,
        "status": job.status,
        "percent": job.percent,
        "stage": job.stage,
        "executor": job.executor,
        "claimed_by": job.claimed_by,
    }
    if job.status == "completed" and job.result:
        payload["result"] = job.result
    if job.status == "failed" and job.error:
        payload["error"] = job.error
    return payload
