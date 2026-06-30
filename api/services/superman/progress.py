"""Pelacakan progres job deklarasi Superman (in-memory)."""

from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal

JobStatus = Literal["pending", "running", "completed", "failed"]

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


def create_job(kompensasi_id: str) -> str:
    _cleanup_expired()
    job_id = str(uuid.uuid4())
    with _lock:
        _jobs[job_id] = SupermanJob(
            job_id=job_id,
            kompensasi_id=kompensasi_id.strip(),
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


def make_progress_callback(job_id: str) -> ProgressCallback:
    def _report(percent: int, stage: str) -> None:
        update_job(job_id, percent, stage)

    return _report