from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from services.auth_deps import require_write
from services.aggregate_save import save_katalog, save_katalog_foto, save_pbb

router = APIRouter(prefix="/api", tags=["Simpan agregat"], dependencies=[Depends(require_write)])


class PBBSave(BaseModel):
    pbb: dict[str, Any]
    objek: list[dict[str, Any]] | None = None


class KatalogSave(BaseModel):
    katalog: dict[str, Any]
    aksesibilitas: list[dict[str, Any]] | None = None
    lingkungan: list[dict[str, Any]] | None = None
    skema: list[dict[str, Any]] | None = None


class FotoSave(BaseModel):
    slot_id: str = Field(min_length=1, max_length=100)
    url: str = Field(min_length=1)


def _save(db: Session, operation, *args):
    try:
        result = operation(db, *args)
        db.commit()
        return result
    except DataError:
        db.rollback()
        raise HTTPException(422, "Nilai data tidak valid atau melebihi panjang yang diizinkan.") from None
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Data tidak dapat disimpan. Periksa kelengkapan dan referensi data.") from None
    except Exception:
        db.rollback()
        raise


@router.post("/pbb")
def create_pbb(body: PBBSave, db: Session = Depends(get_db)):
    return _save(db, save_pbb, body.pbb, body.objek)


@router.patch("/pbb/{record_id}")
def update_pbb(record_id: UUID, body: PBBSave, db: Session = Depends(get_db)):
    return _save(db, save_pbb, body.pbb, body.objek, str(record_id))


def _children(body: KatalogSave) -> dict:
    return {key: getattr(body, key) for key in ("aksesibilitas", "lingkungan", "skema") if getattr(body, key) is not None}


@router.post("/katalog")
def create_katalog(body: KatalogSave, db: Session = Depends(get_db)):
    return _save(db, save_katalog, body.katalog, _children(body))


@router.patch("/katalog/{record_id}")
def update_katalog(record_id: UUID, body: KatalogSave, db: Session = Depends(get_db)):
    return _save(db, save_katalog, body.katalog, _children(body), str(record_id))


@router.post("/katalog/{record_id}/foto")
def replace_foto(record_id: UUID, body: FotoSave, db: Session = Depends(get_db)):
    return _save(db, save_katalog_foto, str(record_id), body.slot_id, body.url)
