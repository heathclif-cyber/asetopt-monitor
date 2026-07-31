#!/usr/bin/env python3
"""Agent lokal Superman — Playwright di PC, job dari API Railway.

Contoh:
  python scripts/superman/commands/agent.py watch \\
    --api https://monitoringpemasaran-production.up.railway.app \\
    --username admin --password secret

Credential Superman (portal PTPN) diambil dari environment / api/.env:
  SUPERMAN_USER, SUPERMAN_PASSWORD (atau SUPERMAN_PASSWORD_B64)
"""

from __future__ import annotations

import argparse
import os
import socket
import sys
import tempfile
import time
import traceback
import uuid
from pathlib import Path
from typing import Any

import httpx

# ── path: impor package services dari folder api/ ─────────────────────────────
ROOT = Path(__file__).resolve().parents[3]
API_DIR = ROOT / "api"
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

try:
    from dotenv import load_dotenv

    load_dotenv(API_DIR / ".env")
    load_dotenv(ROOT / ".env")
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

AGENT_VERSION = "1.0.0"
DEFAULT_POLL = 3.0
DEFAULT_HEARTBEAT = 15.0


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None, timeout: float = 120.0):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        h = {"Accept": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
            h["X-Asetopt-Token"] = self.token
        return h

    def login(self, username: str, password: str) -> str:
        r = httpx.post(
            f"{self.base_url}/api/auth/login",
            json={"username": username, "password": password},
            timeout=30.0,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Login API gagal ({r.status_code}): {r.text[:300]}")
        data = r.json()
        token = data.get("token")
        if not token:
            raise RuntimeError("Login API tidak mengembalikan token")
        self.token = token
        return token

    def post(self, path: str, json: dict | None = None) -> Any:
        r = httpx.post(
            f"{self.base_url}{path}",
            json=json or {},
            headers=self._headers(),
            timeout=self.timeout,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"POST {path} → {r.status_code}: {r.text[:500]}")
        if not r.content:
            return {}
        return r.json()

    def get(self, path: str) -> Any:
        r = httpx.get(
            f"{self.base_url}{path}",
            headers=self._headers(),
            timeout=self.timeout,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"GET {path} → {r.status_code}: {r.text[:500]}")
        return r.json()

    def download(self, path: str, dest: Path) -> Path:
        r = httpx.get(
            f"{self.base_url}{path}",
            headers=self._headers(),
            timeout=self.timeout,
            follow_redirects=True,
        )
        if r.status_code >= 400:
            raise RuntimeError(f"Download {path} → {r.status_code}: {r.text[:300]}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(r.content)
        return dest


def _local_state_path() -> Path:
    custom = os.getenv("SUPERMAN_STATE_PATH", "").strip()
    if custom:
        return Path(custom)
    return Path(__file__).resolve().parents[1] / ".superman_state.json"


def _build_superman_config(bundle_meta: dict[str, Any] | None = None):
    from services.superman.config import SupermanConfig

    base = SupermanConfig.from_env()
    state = str(_local_state_path())
    meta = bundle_meta or {}
    data = {
        "base_url": (meta.get("base_url") or base.base_url).rstrip("/") + "/",
        "username": base.username,
        "password": base.password,
        "flow_id": str(meta.get("flow_id") or base.flow_id),
        "bagian": str(meta.get("bagian") or base.bagian),
        "gl_pendapatan": str(meta.get("gl_pendapatan") or base.gl_pendapatan),
        "gl_ppn": str(meta.get("gl_ppn") or base.gl_ppn),
        "profit_center": str(meta.get("profit_center") or base.profit_center),
        "profit_center_ppn": str(meta.get("profit_center_ppn") or base.profit_center_ppn),
        "cash_flow": str(meta.get("cash_flow") or base.cash_flow),
        "state_path": state,
        "headless": os.getenv("SUPERMAN_HEADLESS", "true").lower() == "true",
        "slow_mo_ms": int(os.getenv("SUPERMAN_SLOW_MO", "0") or 0),
    }
    if not data["username"] or not data["password"]:
        raise RuntimeError(
            "Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment atau api/.env "
            "(credential portal Superman, bukan user app)."
        )
    return SupermanConfig(**data)


def ensure_local_session(cfg, *, headed_on_fail: bool = True) -> str:
    from services.superman.auth import (
        SupermanCaptchaError,
        SupermanCaptchaRequired,
        _save_session,
        ensure_session,
    )

    try:
        return ensure_session(cfg, auto_login=True)
    except (SupermanCaptchaRequired, SupermanCaptchaError) as exc:
        print(f"[agent] Auto-login gagal ({exc}).", flush=True)
        if not headed_on_fail:
            raise
        print(
            "[agent] Membuka browser untuk captcha manual — "
            "selesaikan login Superman di jendela browser, tunggu sampai masuk dashboard.",
            flush=True,
        )
        return _save_session(cfg, manual=True)


def run_one_job(api: ApiClient, agent_id: str, job: dict[str, Any]) -> None:
    from services.superman.payload import DeklarasiPayload
    from services.superman.runner import run_browser_deklarasi

    job_id = job["job_id"]
    print(f"[agent] Job {job_id} kompensasi={job.get('kompensasi_id')}", flush=True)

    def progress(percent: int, stage: str) -> None:
        print(f"  [{percent:3d}%] {stage}", flush=True)
        try:
            api.post(
                f"/api/superman/agent/jobs/{job_id}/progress",
                {"percent": percent, "stage": stage},
            )
        except Exception as exc:
            print(f"  [warn] progress report gagal: {exc}", flush=True)

    try:
        progress(2, "Mengunduh paket job dari API")
        bundle = api.get(f"/api/superman/agent/jobs/{job_id}/bundle")
        payload = DeklarasiPayload.from_dict(bundle["payload"])
        cfg = _build_superman_config(bundle.get("superman"))

        progress(5, "Memvalidasi session Superman di PC")
        ensure_local_session(cfg, headed_on_fail=True)

        docs_meta = bundle.get("docs") or []
        work = Path(tempfile.mkdtemp(prefix="superman_agent_"))
        paths: list[Path] = []
        labels: list[str] = []
        for doc in docs_meta:
            idx = int(doc["index"])
            name = doc.get("file_name") or f"doc_{idx}.bin"
            # hindari path traversal
            safe = Path(name).name
            dest = work / f"{idx}_{safe}"
            progress(8 + idx, f"Unduh dokumen: {safe}")
            api.download(f"/api/superman/agent/jobs/{job_id}/files/{idx}", dest)
            paths.append(dest)
            labels.append(doc.get("label") or safe)

        progress(15, "Menjalankan Playwright di PC")
        result = run_browser_deklarasi(
            cfg,
            payload,
            paths,
            on_progress=progress,
            support_labels=labels,
            persist=False,
        )
        api.post(
            f"/api/superman/agent/jobs/{job_id}/complete",
            {"result": result},
        )
        saved = result.get("superman_saved") or result.get("sppn_no") or result.get("sppb_no")
        print(f"[agent] Selesai job {job_id}: {saved or result.get('message')}", flush=True)
    except Exception as exc:
        err = f"{exc}\n{traceback.format_exc()}"
        print(f"[agent] GAGAL job {job_id}: {exc}", flush=True)
        try:
            api.post(
                f"/api/superman/agent/jobs/{job_id}/fail",
                {"error": str(exc)[:2000]},
            )
        except Exception as report_exc:
            print(f"[agent] Gagal report fail: {report_exc}\n{err}", flush=True)


def cmd_watch(args: argparse.Namespace) -> int:
    agent_id = args.agent_id or f"{socket.gethostname()}-{uuid.uuid4().hex[:8]}"
    api = ApiClient(args.api)
    print(f"[agent] Login ke {args.api} sebagai {args.username} ...", flush=True)
    api.login(args.username, args.password)
    print(f"[agent] Online. agent_id={agent_id}  (Ctrl+C untuk berhenti)", flush=True)
    print(
        "[agent] Biarkan jendela ini terbuka. Di web: Input Pembayaran → Kirim ke Superman.",
        flush=True,
    )

    # Validasi credential Superman lebih awal
    try:
        cfg = _build_superman_config()
        print(f"[agent] Portal Superman: {cfg.base_url} user={cfg.username}", flush=True)
        print(f"[agent] Session file: {cfg.state_path}", flush=True)
    except Exception as exc:
        print(f"[agent] PERINGATAN: {exc}", flush=True)

    last_hb = 0.0
    while True:
        now = time.time()
        if now - last_hb >= args.heartbeat:
            try:
                api.post(
                    "/api/superman/agent/heartbeat",
                    {
                        "agent_id": agent_id,
                        "hostname": socket.gethostname(),
                        "version": AGENT_VERSION,
                    },
                )
                last_hb = now
            except Exception as exc:
                print(f"[agent] heartbeat gagal: {exc}", flush=True)
                # coba re-login
                try:
                    api.login(args.username, args.password)
                except Exception as login_exc:
                    print(f"[agent] re-login gagal: {login_exc}", flush=True)

        try:
            data = api.get(f"/api/superman/agent/jobs/next?agent_id={agent_id}")
            job = data.get("job")
            if job:
                run_one_job(api, agent_id, job)
        except Exception as exc:
            print(f"[agent] poll error: {exc}", flush=True)

        time.sleep(args.poll)


def cmd_status(args: argparse.Namespace) -> int:
    api = ApiClient(args.api)
    api.login(args.username, args.password)
    st = api.get("/api/superman/status")
    print("configured:", st.get("configured"))
    print("superman_reachable:", st.get("superman_reachable"), st.get("superman_reach_error"))
    print("needs_local_agent:", st.get("needs_local_agent"))
    print("agent_online:", st.get("agent_online"), "count=", st.get("agent_count"))
    print("can_start_deklarasi:", st.get("can_start_deklarasi"))
    for a in st.get("agents") or []:
        print("  -", a)
    if st.get("agent_help"):
        print("\n--- agent help ---\n", st["agent_help"])
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Agent lokal Superman untuk AsetOpt Monitor")
    sub = p.add_subparsers(dest="command", required=True)

    def add_common(sp: argparse.ArgumentParser) -> None:
        sp.add_argument(
            "--api",
            default=os.getenv(
                "ASETOPT_API_URL",
                "https://monitoringpemasaran-production.up.railway.app",
            ),
            help="Base URL app/API Railway",
        )
        sp.add_argument(
            "--username",
            default=os.getenv("ASETOPT_USER", ""),
            help="Username login AsetOpt (admin)",
        )
        sp.add_argument(
            "--password",
            default=os.getenv("ASETOPT_PASSWORD", ""),
            help="Password login AsetOpt",
        )

    w = sub.add_parser("watch", help="Heartbeat + ambil job deklarasi")
    add_common(w)
    w.add_argument("--agent-id", default="", help="ID agent (opsional)")
    w.add_argument("--poll", type=float, default=DEFAULT_POLL, help="Interval poll job (detik)")
    w.add_argument(
        "--heartbeat",
        type=float,
        default=DEFAULT_HEARTBEAT,
        help="Interval heartbeat (detik)",
    )
    w.set_defaults(func=cmd_watch)

    s = sub.add_parser("status", help="Cek status Superman + agent di API")
    add_common(s)
    s.set_defaults(func=cmd_status)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.username or not args.password:
        print(
            "Wajib: --username dan --password (user admin app AsetOpt), "
            "atau set ASETOPT_USER / ASETOPT_PASSWORD.",
            file=sys.stderr,
        )
        return 2
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        print("\n[agent] Dihentikan.", flush=True)
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
