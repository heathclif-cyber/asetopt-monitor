"""Resolve dokumen pendukung SPPn dari upload AsetOpt Monitor."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

from sqlalchemy.orm import Session, joinedload

import models
from services.storage import StorageError, build_folder, get_file_path

_PREFERRED_EXTENSIONS = (".pdf", ".jpg", ".jpeg", ".png")
_PENDING_SUPPORT_HINT = (
    "Upload Kontrak (di Kerja Sama), Invoice Kompensasi, dan Rekening Koran bukti bayar (wajib). "
    "Kuitansi opsional."
)
_ATTACH_ORDER = {"kontrak": 0, "invoice": 1, "rekening_koran": 2, "kuitansi": 3}

SupportSource = tuple[str, str, str, str]


@dataclass(frozen=True)
class ResolvedSupportDoc:
    path: Path
    entity_type: str
    entity_id: str
    doc_type: str
    file_name: str
    label: str

    def describe(self) -> str:
        return f"{self.label} ({self.entity_type}/{self.entity_id}, {self.file_name})"


def _latest_upload(
    db: Session,
    entity_type: str,
    entity_id: str,
    doc_type: str,
) -> models.DocumentUpload | None:
    try:
        entity_uuid = UUID(entity_id)
    except ValueError:
        return None
    return (
        db.query(models.DocumentUpload)
        .filter(
            models.DocumentUpload.entity_type == entity_type,
            models.DocumentUpload.entity_id == entity_uuid,
            models.DocumentUpload.doc_type == doc_type,
        )
        .order_by(models.DocumentUpload.uploaded_at.desc())
        .first()
    )


def _path_from_upload(upload: models.DocumentUpload) -> Path:
    if not upload.storage_path:
        raise StorageError("storage_path kosong")
    return Path(get_file_path(upload.storage_path))


def _scan_folder(entity_type: str, entity_id: str, doc_type: str) -> Path | None:
    folder = build_folder(entity_type, entity_id, doc_type)
    if not os.path.isdir(folder):
        return None
    files = [
        os.path.join(folder, name)
        for name in os.listdir(folder)
        if os.path.isfile(os.path.join(folder, name))
    ]
    if not files:
        return None
    for ext in _PREFERRED_EXTENSIONS:
        for file_path in files:
            if file_path.lower().endswith(ext):
                return Path(file_path)
    return Path(files[0])


def _resolve_upload(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
    label: str,
) -> ResolvedSupportDoc:
    upload = _latest_upload(db, entity_type, entity_id, doc_type)
    if upload:
        try:
            path = _path_from_upload(upload)
            if path.is_file():
                return ResolvedSupportDoc(
                    path=path,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    doc_type=doc_type,
                    file_name=upload.file_name,
                    label=label,
                )
        except StorageError:
            pass

    scanned = _scan_folder(entity_type, entity_id, doc_type)
    if scanned and scanned.is_file():
        return ResolvedSupportDoc(
            path=scanned,
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
            file_name=scanned.name,
            label=label,
        )

    raise FileNotFoundError(
        f"Dokumen {label} tidak ditemukan untuk {entity_type}={entity_id} "
        f"(doc_type={doc_type}). Upload di AsetOpt Monitor."
    )


def _upload_status(
    db: Session,
    *,
    entity_type: str,
    entity_id: str,
    doc_type: str,
) -> tuple[bool, str | None]:
    upload = _latest_upload(db, entity_type, entity_id, doc_type)
    if upload:
        file_name = upload.file_name
        if upload.storage_path:
            try:
                path = Path(get_file_path(upload.storage_path))
                if path.is_file():
                    return True, file_name
            except StorageError:
                pass
        try:
            path = _path_from_upload(upload)
            if path.is_file():
                return True, file_name
        except StorageError:
            pass
        if upload.storage_path:
            return True, file_name

    scanned = _scan_folder(entity_type, entity_id, doc_type)
    if scanned and scanned.is_file():
        return True, scanned.name
    return False, None


def _requirement_entry(
    db: Session,
    source: SupportSource,
    *,
    required: bool = True,
) -> dict[str, str | bool | None]:
    entity_type, entity_id, doc_type, label = source
    uploaded, file_name = _upload_status(
        db,
        entity_type=entity_type,
        entity_id=entity_id,
        doc_type=doc_type,
    )
    suffix = "" if required else " (opsional)"
    return {
        "label": f"{label}{suffix}",
        "entity_type": entity_type,
        "entity_id": entity_id,
        "doc_type": doc_type,
        "uploaded": uploaded,
        "file_name": file_name,
        "required": required,
        "upload_hint": (
            f"{label} sudah diupload ({file_name})"
            if uploaded and file_name
            else f"Upload {label} untuk {entity_type}={entity_id}"
        ),
    }


def _requirements_from_sources(
    db: Session,
    mandatory_sources: list[SupportSource],
    optional_sources: list[SupportSource] | None = None,
) -> tuple[list[dict[str, str | bool | None]], bool]:
    requirements = [_requirement_entry(db, source, required=True) for source in mandatory_sources]
    for source in optional_sources or []:
        requirements.append(_requirement_entry(db, source, required=False))
    ready = all(req["uploaded"] for req in requirements if req.get("required", True))
    return requirements, ready


def _latest_pembayaran(kompensasi: models.Kompensasi) -> models.Pembayaran | None:
    pay_rows = sorted(
        kompensasi.pembayaran or [],
        key=lambda p: (p.tgl_bayar or "", p.no_pembayaran or ""),
        reverse=True,
    )
    return pay_rows[0] if pay_rows else None


def _resolve_rekening_koran(db: Session, kompensasi: models.Kompensasi, label: str) -> ResolvedSupportDoc:
    komp_id = str(kompensasi.id)
    try:
        return _resolve_upload(
            db,
            entity_type="kompensasi",
            entity_id=komp_id,
            doc_type="rekening_koran",
            label=label,
        )
    except FileNotFoundError:
        pass

    pay_rows = sorted(
        kompensasi.pembayaran or [],
        key=lambda p: (p.tgl_bayar or "", p.no_pembayaran or ""),
        reverse=True,
    )
    last_error: FileNotFoundError | None = None
    for pay in pay_rows:
        try:
            return _resolve_upload(
                db,
                entity_type="pembayaran",
                entity_id=str(pay.id),
                doc_type="rekening_koran",
                label=label,
            )
        except FileNotFoundError as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise FileNotFoundError(
        f"Dokumen {label} tidak ditemukan untuk kompensasi={kompensasi.id} "
        "(doc_type=rekening_koran). Upload di AsetOpt Monitor."
    )


def _rekening_koran_uploaded(db: Session, kompensasi: models.Kompensasi) -> tuple[bool, str | None]:
    komp_id = str(kompensasi.id)
    uploaded, file_name = _upload_status(
        db,
        entity_type="kompensasi",
        entity_id=komp_id,
        doc_type="rekening_koran",
    )
    if uploaded:
        return uploaded, file_name

    pay_rows = sorted(
        kompensasi.pembayaran or [],
        key=lambda p: (p.tgl_bayar or "", p.no_pembayaran or ""),
        reverse=True,
    )
    for pay in pay_rows:
        uploaded, file_name = _upload_status(
            db,
            entity_type="pembayaran",
            entity_id=str(pay.id),
            doc_type="rekening_koran",
        )
        if uploaded:
            return uploaded, file_name
    return False, None


def _kompensasi_mandatory_sources(kompensasi: models.Kompensasi) -> list[SupportSource]:
    komp_id = str(kompensasi.id)
    ks_id = str(kompensasi.ks_id) if kompensasi.ks_id else ""
    sources: list[SupportSource] = []
    if ks_id:
        sources.append(("kerja_sama", ks_id, "kontrak", "Dokumen Kontrak / Perjanjian"))
    sources.extend(
        [
            ("kompensasi", komp_id, "invoice", "Invoice / Tagihan"),
            ("kompensasi", komp_id, "rekening_koran", "Rekening Koran Bukti Bayar"),
        ]
    )
    return sources


def _kompensasi_optional_sources(kompensasi: models.Kompensasi) -> list[SupportSource]:
    pay_rows = sorted(
        kompensasi.pembayaran or [],
        key=lambda p: (p.tgl_bayar or "", p.no_pembayaran or ""),
        reverse=True,
    )
    if not pay_rows:
        return []
    pay_id = str(pay_rows[0].id)
    return [("pembayaran", pay_id, "kuitansi", "Kuitansi")]


def superman_doc_gate_message(
    requirements: list[dict[str, str | bool | None]],
    *,
    ready: bool,
) -> str | None:
    if ready:
        return None
    required = [req for req in requirements if req.get("required", True)]
    if not required:
        return "Dokumen pendukung Superman belum terlampir. Upload Kontrak, Invoice, dan Rekening Koran."
    uploaded = sum(1 for req in required if req.get("uploaded"))
    total = len(required)
    missing_labels = [str(req.get("label") or req.get("doc_type") or "dokumen") for req in required if not req.get("uploaded")]
    missing_text = ", ".join(missing_labels) if missing_labels else "Kontrak, Invoice, dan Rekening Koran"
    return (
        f"Dokumen pendukung Superman belum terlampir ({uploaded}/{total} file). "
        f"Coba upload ulang {missing_text}."
    )


def superman_doc_requirements_for_kompensasi(
    db: Session,
    kompensasi_id: str,
) -> tuple[list[dict[str, str | bool | None]], bool]:
    kompensasi = (
        db.query(models.Kompensasi)
        .options(joinedload(models.Kompensasi.pembayaran))
        .filter(models.Kompensasi.id == kompensasi_id.strip())
        .first()
    )
    if not kompensasi:
        return [], False

    mandatory = _kompensasi_mandatory_sources(kompensasi)
    requirements: list[dict[str, str | bool | None]] = []
    for source in mandatory:
        if source[2] == "rekening_koran":
            uploaded, file_name = _rekening_koran_uploaded(db, kompensasi)
            requirements.append(
                {
                    "label": source[3],
                    "entity_type": "kompensasi",
                    "entity_id": str(kompensasi.id),
                    "doc_type": "rekening_koran",
                    "uploaded": uploaded,
                    "file_name": file_name,
                    "required": True,
                    "upload_hint": (
                        f"{source[3]} sudah diupload ({file_name})"
                        if uploaded and file_name
                        else f"Upload {source[3]} untuk kompensasi={kompensasi.id}"
                    ),
                }
            )
        else:
            requirements.append(_requirement_entry(db, source, required=True))

    for source in _kompensasi_optional_sources(kompensasi):
        requirements.append(_requirement_entry(db, source, required=False))

    ready = all(req["uploaded"] for req in requirements if req.get("required", True))
    return requirements, ready


def resolve_support_docs_for_kompensasi(db: Session, kompensasi_id: str) -> list[ResolvedSupportDoc]:
    kompensasi = (
        db.query(models.Kompensasi)
        .options(joinedload(models.Kompensasi.pembayaran))
        .filter(models.Kompensasi.id == kompensasi_id.strip())
        .first()
    )
    if not kompensasi:
        raise ValueError(f"Kompensasi tidak ditemukan: {kompensasi_id}")

    mandatory = _kompensasi_mandatory_sources(kompensasi)
    missing: list[str] = []
    resolved: list[ResolvedSupportDoc] = []
    for entity_type, entity_id, doc_type, label in mandatory:
        if doc_type == "rekening_koran":
            uploaded, _ = _rekening_koran_uploaded(db, kompensasi)
            if not uploaded:
                missing.append(label)
                continue
            try:
                resolved.append(_resolve_rekening_koran(db, kompensasi, label))
            except FileNotFoundError:
                missing.append(label)
            continue

        uploaded, _ = _upload_status(
            db,
            entity_type=entity_type,
            entity_id=entity_id,
            doc_type=doc_type,
        )
        if not uploaded:
            missing.append(label)
            continue
        try:
            resolved.append(
                _resolve_upload(
                    db,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    doc_type=doc_type,
                    label=label,
                )
            )
        except FileNotFoundError:
            missing.append(label)

    if missing:
        raise FileNotFoundError(
            f"Dokumen wajib belum lengkap: {', '.join(missing)}. {_PENDING_SUPPORT_HINT}"
        )

    resolved.sort(key=lambda doc: _ATTACH_ORDER.get(doc.doc_type, 9))
    return resolved


def resolve_support_docs_from_kompensasi(kompensasi_id: str) -> list[ResolvedSupportDoc]:
    from database import SessionLocal

    db = SessionLocal()
    try:
        return resolve_support_docs_for_kompensasi(db, kompensasi_id)
    finally:
        db.close()