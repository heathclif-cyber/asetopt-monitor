from __future__ import annotations

import os

GL_PPN = os.getenv("SUPERMAN_GL_PPN", "21060008")
GL_PPH = os.getenv("SUPERMAN_GL_PPH", "51100881")
CF_PPH_ID = os.getenv("SUPERMAN_CF_PPH", "204")
KPP_RECIPIENT_NAME = os.getenv("SUPERMAN_KPP_NAME", "KPP Wajib Pajak Besar 3")
SAP_CUSTOMER = "8S00000001"
PROFIT_CENTER_SEARCH = os.getenv("SUPERMAN_PROFIT_CENTER_SEARCH", "Regional 8")
# master_cash_flow_id 2 = A0102000; SPPn sewa asli memakai A0102000 untuk pokok maupun PPN
CF_PENDAPATAN_ID = "2"
CF_PPN_ID = "2"
DEFAULT_GL_PENDAPATAN_ASET = os.getenv("SUPERMAN_GL_PENDAPATAN_ASET", "11015204")


def resolve_gl_pendapatan_aset() -> str:
    return DEFAULT_GL_PENDAPATAN_ASET