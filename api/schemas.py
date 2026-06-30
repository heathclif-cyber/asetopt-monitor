from datetime import date, datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PembayaranCreate(BaseModel):
    kompensasi_id: UUID
    tgl_bayar: date
    nominal_bayar: float = Field(gt=0)
    is_pph_disetor: bool = False
    keterangan: Optional[str] = None
    bukti_url: Optional[str] = None


class PembayaranOut(BaseModel):
    id: UUID
    kompensasi_id: UUID
    no_pembayaran: Optional[str] = None
    tgl_bayar: date
    nominal_bayar: float
    is_pph_disetor: bool = False
    superman: Optional[str] = None
    bukti_url: Optional[str] = None
    keterangan: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentUploadOut(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    doc_type: str
    file_name: str
    storage_path: str
    web_url: str
    uploaded_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DocumentSlotOut(BaseModel):
    doc_type: str
    label: str
    uploaded: bool
    file_exists: bool = True
    file_name: Optional[str] = None
    web_url: Optional[str] = None
    uploaded_at: Optional[datetime] = None
    document_id: Optional[UUID] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None


class DocumentCompletenessSummary(BaseModel):
    total: int
    uploaded: int
    missing: int


class DocumentCompletenessOut(BaseModel):
    entity_type: str
    entity_id: str
    display_label: str
    sublabel: Optional[str] = None
    slots: List[DocumentSlotOut]
    summary: DocumentCompletenessSummary


class SupermanCaptchaVerifyBody(BaseModel):
    challenge_id: str = Field(..., min_length=1)
    answer: str = Field(..., min_length=1)