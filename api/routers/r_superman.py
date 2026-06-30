from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

import schemas
from database import get_db
from services.superman.auth import SupermanCaptchaError, SupermanCaptchaRequired
from services.superman.documents import superman_doc_requirements_for_kompensasi
from services.superman.runner import (
    SupermanNotConfiguredError,
    get_deklarasi_progress,
    get_status,
    inspect_superman_todo,
    preview_deklarasi,
    recover_superman_from_todo,
    refresh_captcha,
    request_captcha,
    start_deklarasi_job,
    submit_deklarasi_kompensasi,
    verify_captcha,
)

router = APIRouter(prefix="/api/superman", tags=["Superman"])


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