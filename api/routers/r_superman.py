from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

import schemas
from database import get_db
from services.auth_deps import require_admin
from services.superman.agent_registry import heartbeat as agent_heartbeat
from services.superman.auth import SupermanCaptchaError, SupermanCaptchaRequired
from services.superman.documents import superman_doc_requirements_for_kompensasi
from services.superman.runner import (
    AGENT_HELP_MESSAGE,
    SupermanAgentRequired,
    SupermanNotConfiguredError,
    agent_claim_next,
    agent_complete_job,
    agent_fail_job,
    agent_report_progress,
    build_agent_job_bundle,
    get_deklarasi_progress,
    get_status,
    inspect_superman_todo,
    preview_deklarasi,
    recover_superman_from_todo,
    refresh_captcha,
    request_captcha,
    resolve_agent_doc_path,
    start_deklarasi_job,
    submit_deklarasi_kompensasi,
    verify_captcha,
)

router = APIRouter(
    prefix="/api/superman",
    tags=["Superman"],
    dependencies=[Depends(require_admin)],
)


class AgentHeartbeatBody(BaseModel):
    agent_id: str = Field(..., min_length=1)
    hostname: str = ""
    version: str = ""


class AgentProgressBody(BaseModel):
    percent: int = Field(..., ge=0, le=100)
    stage: str = Field(..., min_length=1)


class AgentCompleteBody(BaseModel):
    result: dict = Field(default_factory=dict)


class AgentFailBody(BaseModel):
    error: str = Field(..., min_length=1)


def _map_deklarasi_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        message = str(exc)
        if "sudah pernah dibuatkan SPPn/SPPb" in message:
            return HTTPException(status_code=409, detail=message)
        return HTTPException(status_code=404, detail=message)
    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, SupermanNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, SupermanAgentRequired):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, SupermanCaptchaRequired):
        return HTTPException(status_code=401, detail=str(exc))
    if isinstance(exc, SupermanCaptchaError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, RuntimeError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=502, detail=f"Gagal mengisi Superman: {exc}")


@router.get("/status")
def superman_status():
    return get_status()


@router.get("/captcha")
def superman_captcha():
    try:
        return request_captcha()
    except SupermanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        # Timeout jaringan ke portal → arahkan ke agent
        msg = str(exc)
        low = msg.lower()
        if any(x in low for x in ("timeout", "timed out", "connect", "network", "err_")):
            raise HTTPException(
                status_code=503,
                detail=AGENT_HELP_MESSAGE,
            ) from exc
        raise HTTPException(status_code=502, detail=msg) from exc
    except Exception as exc:
        low = str(exc).lower()
        if any(x in low for x in ("timeout", "timed out", "connect")):
            raise HTTPException(status_code=503, detail=AGENT_HELP_MESSAGE) from exc
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/captcha/refresh")
def superman_captcha_refresh(challenge_id: str = Query(..., min_length=1)):
    try:
        return refresh_captcha(challenge_id)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/captcha/verify")
def superman_captcha_verify(body: schemas.SupermanCaptchaVerifyBody):
    try:
        return verify_captcha(body.challenge_id, body.answer)
    except ValueError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/doc-requirements")
def superman_doc_requirements(
    kompensasi_id: UUID = Query(...),
    db=Depends(get_db),
):
    reqs, ready = superman_doc_requirements_for_kompensasi(db, str(kompensasi_id))
    return {"requirements": reqs, "ready": ready}


@router.get("/preview")
def superman_preview(kompensasi_id: UUID = Query(...)):
    try:
        return preview_deklarasi(kompensasi_id=str(kompensasi_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupermanNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/recover")
def superman_recover(
    kompensasi_id: UUID = Query(...),
    force: bool = Query(False),
):
    try:
        return recover_superman_from_todo(kompensasi_id=str(kompensasi_id), force=force)
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/todo-inspect")
def superman_todo_inspect(kompensasi_id: UUID = Query(...)):
    try:
        return inspect_superman_todo(kompensasi_id=str(kompensasi_id))
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.post("/deklarasi/start")
def superman_deklarasi_start(kompensasi_id: UUID = Query(...)):
    try:
        return start_deklarasi_job(kompensasi_id=str(kompensasi_id))
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


@router.get("/deklarasi/progress")
def superman_deklarasi_progress(job_id: str = Query(..., min_length=1)):
    try:
        return get_deklarasi_progress(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/deklarasi")
def superman_deklarasi(kompensasi_id: UUID = Query(...)):
    try:
        return submit_deklarasi_kompensasi(str(kompensasi_id))
    except Exception as exc:
        raise _map_deklarasi_error(exc) from exc


# ─── Local agent API ─────────────────────────────────────────────────────────


@router.post("/agent/heartbeat")
def superman_agent_heartbeat(body: AgentHeartbeatBody):
    return agent_heartbeat(
        body.agent_id,
        hostname=body.hostname,
        version=body.version,
    )


@router.get("/agent/jobs/next")
def superman_agent_jobs_next(agent_id: str = Query(..., min_length=1)):
    claimed = agent_claim_next(agent_id)
    if not claimed:
        return {"job": None}
    return {"job": claimed}


@router.get("/agent/jobs/{job_id}/bundle")
def superman_agent_job_bundle(job_id: str):
    try:
        return build_agent_job_bundle(job_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/agent/jobs/{job_id}/files/{index}")
def superman_agent_job_file(job_id: str, index: int):
    try:
        path = resolve_agent_doc_path(job_id, index)
    except (ValueError, FileNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path=str(path),
        filename=path.name,
        media_type="application/octet-stream",
    )


@router.post("/agent/jobs/{job_id}/progress")
def superman_agent_job_progress(job_id: str, body: AgentProgressBody):
    try:
        return agent_report_progress(job_id, body.percent, body.stage)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/agent/jobs/{job_id}/complete")
def superman_agent_job_complete(job_id: str, body: AgentCompleteBody):
    try:
        return agent_complete_job(job_id, body.result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/agent/jobs/{job_id}/fail")
def superman_agent_job_fail(job_id: str, body: AgentFailBody):
    try:
        return agent_fail_job(job_id, body.error)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
