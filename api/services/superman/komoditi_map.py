from __future__ import annotations

import os

GL_PPN = os.getenv("SUPERMAN_GL_PPN", "21060008")
GL_PPH = os.getenv("SUPERMAN_GL_PPH", "51100881")
# master_cash_flow_id 15 = A0209000 Pembayaran kas lainnya (SPPb PPh Final 2026)
CF_PPH_ID = os.getenv("SUPERMAN_CF_PPH", "15")
KPP_RECIPIENT_NAME = os.getenv("SUPERMAN_KPP_NAME", "KPP Wajib Pajak Besar 3")
PROFIT_CENTER_SEARCH = os.getenv("SUPERMAN_PROFIT_CENTER_SEARCH", "Regional 8")
# master_cash_flow_id 2 = A0102000; SPPn sewa asli memakai A0102000 untuk pokok maupun PPN
CF_PENDAPATAN_ID = "2"
CF_PPN_ID = "2"
