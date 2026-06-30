from __future__ import annotations

import base64
import os
from dataclasses import dataclass


def _env_credential(name: str, *, b64_name: str | None = None) -> str:
    raw_b64 = os.getenv(b64_name or "", "").strip() if b64_name else ""
    if raw_b64:
        try:
            return base64.b64decode(raw_b64).decode("utf-8")
        except Exception as exc:
            raise RuntimeError(f"{b64_name} tidak valid (harus base64 UTF-8).") from exc
    value = os.getenv(name, "")
    if not value:
        return ""
    return value.strip().strip('"').strip("'")


@dataclass(frozen=True)
class SupermanConfig:
    base_url: str
    username: str
    password: str
    flow_id: str
    bagian: str
    gl_pendapatan: str
    gl_ppn: str
    profit_center: str
    profit_center_ppn: str
    cash_flow: str
    state_path: str
    headless: bool
    slow_mo_ms: int

    @classmethod
    def from_env(cls) -> "SupermanConfig":
        api_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        base = os.getenv("SUPERMAN_URL", "https://superman.ptpn1.co.id/").rstrip("/") + "/"
        return cls(
            base_url=base,
            username=_env_credential("SUPERMAN_USER"),
            password=_env_credential("SUPERMAN_PASSWORD", b64_name="SUPERMAN_PASSWORD_B64"),
            flow_id=os.getenv("SUPERMAN_FLOW_ID", "32"),
            bagian=os.getenv("SUPERMAN_BAGIAN", "223"),
            gl_pendapatan=os.getenv("SUPERMAN_GL_PENDAPATAN_ASET", "41100030"),
            gl_ppn=os.getenv("SUPERMAN_GL_PPN", "21060008"),
            profit_center=os.getenv("SUPERMAN_PROFIT_CENTER", "A0101"),
            profit_center_ppn=os.getenv("SUPERMAN_PROFIT_CENTER_PPN", "A0102"),
            cash_flow=os.getenv("SUPERMAN_CASH_FLOW", "1"),
            state_path=os.getenv(
                "SUPERMAN_STATE_PATH",
                os.path.join(api_dir, ".superman_state.json"),
            ),
            headless=os.getenv("SUPERMAN_HEADLESS", "true").lower() == "true",
            slow_mo_ms=int(os.getenv("SUPERMAN_SLOW_MO", "150")),
        )