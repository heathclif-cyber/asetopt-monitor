from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


GISKind = Literal["konsesi", "tanaman", "hutan", "opset", "okupasi", "administrasi"]


class DatasetCreateBody(BaseModel):
    kind: GISKind
    name: str = Field(min_length=1, max_length=255)
    scope_key: str = Field(default="", max_length=160)


class DatasetUpdateBody(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    expected_revision: int = Field(ge=0)


class DatasetArchiveBody(BaseModel):
    expected_revision: int = Field(ge=0)


class ImportMappingBody(BaseModel):
    selected_feature_ids: list[str] | None = None
    property_mapping: dict[str, str] = Field(default_factory=dict)
    default_attributes: dict[str, Any] = Field(default_factory=dict)
    source_crs: str | None = Field(default="EPSG:4326", max_length=32)
    source_name: str | None = Field(default=None, max_length=255)
    source_url: str | None = Field(default=None, max_length=2000)
    source_year: int | None = Field(default=None, ge=1800, le=3000)
    effective_date: date | None = None
    change_note: str | None = Field(default=None, max_length=2000)


class FeatureDraftPatchBody(BaseModel):
    attributes: dict[str, Any] = Field(default_factory=dict)
    name: str | None = Field(default=None, min_length=1, max_length=500)
    original_properties: dict[str, Any] | None = None
    linked_asset_ids: list[str] | None = None
    expected_draft_revision: int = Field(ge=0)


class PublishBody(BaseModel):
    expected_active_version_id: str | None = None
    expected_revision: int = Field(ge=0)
    report_hash: str = Field(min_length=8, max_length=128)
    acknowledged_warning_codes: list[str] = Field(default_factory=list)
    note: str | None = Field(default=None, max_length=2000)


class RollbackBody(BaseModel):
    target_version_id: str
    expected_revision: int = Field(ge=0)
    reason: str = Field(min_length=3, max_length=1000)


class GrantsBody(BaseModel):
    domains: list[Literal["legal", "tanaman", "opset", "referensi"]]


class KMLDetails(BaseModel):
    nomor_alas_hak: str | None = None
    jenis_alas_hak: str | None = None
    declared_area_m2: float | None = Field(default=None, ge=0)
    tanggal_terbit: date | None = None
    expiry_mode: Literal["fixed", "indefinite", "unknown"] = "unknown"
    tanggal_berakhir: date | None = None

    @model_validator(mode="after")
    def check_expiry(self):
        if self.expiry_mode == "fixed" and self.tanggal_berakhir is None:
            raise ValueError("Tanggal berakhir wajib untuk masa berlaku tetap")
        if self.expiry_mode != "fixed" and self.tanggal_berakhir is not None:
            raise ValueError("Tanggal berakhir hanya digunakan untuk masa berlaku tetap")
        if self.tanggal_terbit and self.tanggal_berakhir and self.tanggal_berakhir < self.tanggal_terbit:
            raise ValueError("Tanggal berakhir tidak boleh sebelum tanggal terbit")
        return self
