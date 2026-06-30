import uuid

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from database import Base


class Aset(Base):
    __tablename__ = "aset"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kode_aset = Column(String(50), nullable=False)
    nama_aset = Column(String(255), nullable=False)
    alamat = Column(Text, nullable=True)

    kerja_sama = relationship("KerjaSama", back_populates="aset")


class KerjaSama(Base):
    __tablename__ = "kerja_sama"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    aset_id = Column(UUID(as_uuid=True), ForeignKey("aset.id"), nullable=True)
    nama_mitra = Column(String(255), nullable=False)
    no_perjanjian = Column(String(100), nullable=True)
    no_kontrak_sap = Column(String(100), nullable=True)
    tgl_mulai = Column(Date, nullable=False)
    tgl_selesai = Column(Date, nullable=False)

    aset = relationship("Aset", back_populates="kerja_sama")
    kompensasi = relationship("Kompensasi", back_populates="kerja_sama")


class Kompensasi(Base):
    __tablename__ = "kompensasi"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ks_id = Column(UUID(as_uuid=True), ForeignKey("kerja_sama.id", ondelete="CASCADE"), nullable=False)
    no_invoice = Column(String(100), nullable=True)
    invoice_tgl = Column(Date, nullable=True)
    superman = Column(Text, nullable=True)
    periode_label = Column(String(100), nullable=True)
    nominal = Column(Numeric(15, 2), nullable=False)
    ppn_persen = Column(Numeric(5, 2), default=11)
    pph_persen = Column(Numeric(5, 2), default=10)
    pph_mode = Column(String(20), nullable=False, default="none")
    nominal_ppn = Column(Numeric(15, 2), nullable=True)
    nominal_pph = Column(Numeric(15, 2), nullable=True)
    total_tagihan = Column(Numeric(15, 2), nullable=True)
    pengurang = Column(Numeric(15, 2), default=0)
    tgl_jatuh_tempo = Column(Date, nullable=False)
    keterangan = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    kerja_sama = relationship("KerjaSama", back_populates="kompensasi")
    pembayaran = relationship("Pembayaran", back_populates="kompensasi", cascade="all, delete-orphan")


class Pembayaran(Base):
    __tablename__ = "pembayaran"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kompensasi_id = Column(UUID(as_uuid=True), ForeignKey("kompensasi.id", ondelete="CASCADE"), nullable=False)
    no_pembayaran = Column(String(100), nullable=True)
    tgl_bayar = Column(Date, nullable=False)
    nominal_bayar = Column(Numeric(15, 2), nullable=False)
    is_pph_disetor = Column(Boolean, default=False)
    superman = Column(Text, nullable=True)
    bukti_url = Column(Text, nullable=True)
    keterangan = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    kompensasi = relationship("Kompensasi", back_populates="pembayaran")


class DocumentUpload(Base):
    __tablename__ = "document_upload"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    doc_type = Column(String(50), nullable=False)
    file_name = Column(Text, nullable=False)
    storage_path = Column(Text, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())