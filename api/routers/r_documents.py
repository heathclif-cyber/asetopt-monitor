from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import models
import schemas
from database import get_db
from services.storage import (
    StorageError,
    delete_file,
    get_file_path,
    get_mode,
    is_configured,
    upload_bytes,
)
from services.superman.documents import superman_doc_requirements_for_kompensasi

router = APIRouter(prefix="/api/documents", tags=["Documents"])

VALID_ENTITY_TYPES = {"kerja_sama", "kompensasi", "pembayaran"}
VALID_DOC_TYPES = {"kontrak", "invoice", "rekening_koran", "kuitansi"}

DOC_TYPE_LABELS = {
    "kontrak": "Dokumen Kontrak / Perjanjian",
    "invoice": "Invoice / Tagihan",
    "rekening_koran": "Rekening Koran Penerimaan",
    "kuitansi": "Kuitansi",
}

ENTITY_DOC_REQUIREMENTS: dict[str, list[str]] = {
    "kerja_sama": ["kontrak"],
    "kompensasi": ["invoice", "rekening_koran"],
    "pembayaran": ["rekening_koran", "kuitansi"],
}

_EXT_MEDIA_TYPE: dict[str, str] = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "xls": "application/vnd.ms-excel",
}


def _file_media_type(file_name: str) -> str:
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    return _EXT_MEDIA_TYPE.get(ext, "application/octet-stream")


def _validate_entity(db: Session, entity_type: str, entity_id: UUID) -> None:
    if entity_type == "kerja_sama":
        if not db.query(models.KerjaSama).filter(models.KerjaSama.id == entity_id).first():
            raise HTTPException(status_code=404, detail="Kerja sama tidak ditemukan")
    elif entity_type == "kompensasi":
        if not db.query(models.Kompensasi).filter(models.Kompensasi.id == entity_id).first():
            raise HTTPException(status_code=404, detail="Kompensasi tidak ditemukan")
    elif entity_type == "pembayaran":
        if not db.query(models.Pembayaran).filter(models.Pembayaran.id == entity_id).first():
            raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")


def _check_file_exists(upload: models.DocumentUpload | None) -> bool:
    if not upload or not upload.storage_path:
        return False
    try:
        get_file_path(upload.storage_path)
        return True
    except StorageError:
        return False


def _build_slots(db: Session, entity_type: str, entity_id: UUID) -> list[schemas.DocumentSlotOut]:
    required = ENTITY_DOC_REQUIREMENTS.get(entity_type, [])
    uploads = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_id,
        )
        .order_by(models.DocumentUpload.uploaded_at.desc())
        .all()
    )
    by_type = {u.doc_type: u for u in uploads}
    slots: list[schemas.DocumentSlotOut] = []
    for doc_type in required:
        upload = by_type.get(doc_type)
        file_exists = _check_file_exists(upload) if upload else False
        slots.append(
            schemas.DocumentSlotOut(
                doc_type=doc_type,
                label=DOC_TYPE_LABELS.get(doc_type, doc_type),
                uploaded=upload is not None,
                file_exists=file_exists,
                file_name=upload.file_name if upload else None,
                web_url=f"/api/documents/download/{upload.id}" if upload else None,
                uploaded_at=upload.uploaded_at if upload else None,
                document_id=upload.id if upload else None,
                entity_type=entity_type,
                entity_id=str(entity_id),
            )
        )
    return slots


def _summarize_slots(slots: list[schemas.DocumentSlotOut]) -> schemas.DocumentCompletenessSummary:
    uploaded = sum(1 for s in slots if s.uploaded and s.file_exists)
    total = len(slots)
    return schemas.DocumentCompletenessSummary(
        total=total, uploaded=uploaded, missing=total - uploaded
    )


def _upload_to_out(record: models.DocumentUpload) -> schemas.DocumentUploadOut:
    return schemas.DocumentUploadOut(
        id=record.id,
        entity_type=record.entity_type,
        entity_id=record.entity_id,
        doc_type=record.doc_type,
        file_name=record.file_name,
        storage_path=record.storage_path,
        web_url=f"/api/documents/download/{record.id}",
        uploaded_at=record.uploaded_at,
    )


@router.get("/status")
def documents_status():
    return {
        "configured": is_configured(),
        "mode": get_mode(),
        "doc_types": sorted(VALID_DOC_TYPES),
        "entity_types": sorted(VALID_ENTITY_TYPES),
    }


@router.get("/requirements")
def kompensasi_doc_requirements(
    kompensasi_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    reqs, ready = superman_doc_requirements_for_kompensasi(db, str(kompensasi_id))
    return {"requirements": reqs, "ready": ready}


@router.get("/completeness", response_model=schemas.DocumentCompletenessOut)
def document_completeness(
    entity_type: str = Query(...),
    entity_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    entity_type = entity_type.strip().lower()
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")

    _validate_entity(db, entity_type, entity_id)

    display_label = str(entity_id)
    sublabel: Optional[str] = None
    if entity_type == "kerja_sama":
        row = db.query(models.KerjaSama).filter(models.KerjaSama.id == entity_id).first()
        display_label = row.no_perjanjian or str(entity_id) if row else str(entity_id)
        sublabel = row.nama_mitra if row else None
    elif entity_type == "kompensasi":
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == entity_id).first()
        display_label = row.no_invoice or str(entity_id) if row else str(entity_id)
        sublabel = row.periode_label if row else None
    elif entity_type == "pembayaran":
        row = db.query(models.Pembayaran).filter(models.Pembayaran.id == entity_id).first()
        display_label = row.no_pembayaran or str(entity_id) if row else str(entity_id)

    slots = _build_slots(db, entity_type, entity_id)
    return schemas.DocumentCompletenessOut(
        entity_type=entity_type,
        entity_id=str(entity_id),
        display_label=display_label,
        sublabel=sublabel,
        slots=slots,
        summary=_summarize_slots(slots),
    )


@router.get("", response_model=List[schemas.DocumentUploadOut])
def list_documents(
    entity_type: str,
    entity_id: UUID,
    doc_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")

    q = db.query(models.DocumentUpload).filter(
        models.DocumentUpload.entity_type == entity_type,
        models.DocumentUpload.entity_id == entity_id,
    )
    if doc_type:
        if doc_type not in VALID_DOC_TYPES:
            raise HTTPException(status_code=400, detail="doc_type tidak valid")
        q = q.filter(models.DocumentUpload.doc_type == doc_type)

    return [_upload_to_out(r) for r in q.order_by(models.DocumentUpload.uploaded_at.desc()).all()]


@router.get("/view/{document_id}")
def view_document(document_id: UUID, db: Session = Depends(get_db)):
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    try:
        file_path = get_file_path(record.storage_path)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(path=file_path, media_type=_file_media_type(record.file_name))


@router.get("/download/{document_id}")
def download_document(document_id: UUID, db: Session = Depends(get_db)):
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")
    try:
        file_path = get_file_path(record.storage_path)
    except StorageError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return FileResponse(
        path=file_path,
        filename=record.file_name,
        media_type="application/octet-stream",
    )


@router.post("/upload", response_model=schemas.DocumentUploadOut)
async def upload_document(
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    doc_type: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    entity_type = entity_type.strip().lower()
    doc_type = doc_type.strip().lower()

    if entity_type not in VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="entity_type tidak valid")
    if doc_type not in VALID_DOC_TYPES:
        raise HTTPException(status_code=400, detail="doc_type tidak valid")
    if not file.filename:
        raise HTTPException(status_code=400, detail="Nama file wajib ada")

    try:
        entity_uuid = UUID(entity_id.strip())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="entity_id UUID tidak valid") from exc

    _validate_entity(db, entity_type, entity_uuid)

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File kosong")

    try:
        result = upload_bytes(
            entity_type=entity_type,
            entity_id=str(entity_uuid),
            doc_type=doc_type,
            file_name=file.filename,
            content=content,
        )
    except StorageError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    existing = (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_uuid,
            models.DocumentUpload.doc_type == doc_type,
        )
        .first()
    )

    if existing:
        if existing.storage_path and existing.storage_path != result["storage_path"]:
            try:
                delete_file(existing.storage_path)
            except StorageError:
                pass
        existing.file_name = result["file_name"]
        existing.storage_path = result["storage_path"]
        record = existing
    else:
        record = models.DocumentUpload(
            entity_type=entity_type,
            entity_id=entity_uuid,
            doc_type=doc_type,
            file_name=result["file_name"],
            storage_path=result["storage_path"],
        )
        db.add(record)

    db.commit()
    db.refresh(record)
    return _upload_to_out(record)


@router.delete("/{document_id}")
def delete_document(document_id: UUID, db: Session = Depends(get_db)):
    record = db.query(models.DocumentUpload).filter(models.DocumentUpload.id == document_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Dokumen tidak ditemukan")

    if record.storage_path:
        try:
            delete_file(record.storage_path)
        except StorageError:
            pass

    db.delete(record)
    db.commit()
    return {"success": True}