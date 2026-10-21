import logging
import os
import asyncio
from contextlib import suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal
from routers.r_auth import router as auth_router
from routers.r_documents import router as documents_router
from routers.r_pembayaran import router as pembayaran_router
from routers.r_rest import router as rest_router
from routers.r_superman import router as superman_router
from routers.r_integrasi import router as integrasi_router
from routers.r_users import router as users_router
from routers.r_gis import router as gis_router
from routers.r_aggregate import router as aggregate_router
from routers.r_notifikasi import router as notifikasi_router
from routers.r_report_format import router as report_format_router
from services.pendapatan_sync import sync_pendapatan
from services.auth_service import auth_secret, ensure_app_users_table, seed_default_users

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AsetOpt Monitor API")

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "ASETOPT_ALLOWED_ORIGINS",
        "http://localhost:3001,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(os.path.join(os.path.dirname(__file__), "uploads"), exist_ok=True)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(rest_router)
app.include_router(pembayaran_router)
app.include_router(documents_router)
app.include_router(superman_router)
app.include_router(integrasi_router)
app.include_router(gis_router)
app.include_router(aggregate_router)
app.include_router(notifikasi_router)
app.include_router(report_format_router)


def reconcile_pendapatan():
    with SessionLocal() as db:
        try:
            result = sync_pendapatan(db)
            db.commit()
            if result['skipped_duplicate_ks']:
                logger.warning('PDDM duplikat perlu rekonsiliasi: %s', result['skipped_duplicate_ks'])
            if result['skipped_recognized_conflict_ks']:
                logger.warning('Pengakuan historis berbeda dari tagihan: %s', result['skipped_recognized_conflict_ks'])
        except Exception:
            db.rollback()
            logger.exception('Rekonsiliasi pendapatan gagal')


async def recognition_worker():
    while True:
        await asyncio.to_thread(reconcile_pendapatan)
        await asyncio.sleep(3600)


@app.on_event('startup')
async def start_recognition_worker():
    app.state.recognition_task = asyncio.create_task(recognition_worker())


@app.on_event('shutdown')
async def stop_recognition_worker():
    app.state.recognition_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.recognition_task


@app.on_event("startup")
def on_startup():
    # Refuse to serve without a real signing secret rather than failing on
    # the first login.
    auth_secret()
    try:
        db = SessionLocal()
        try:
            ensure_app_users_table(db)
            seed_default_users(db)
            logger.info("Auth: app_users ready + seed checked")
        finally:
            db.close()
    except Exception:
        logger.exception("Auth seed gagal — login mungkin belum tersedia")


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "api",
        "git_commit": os.getenv("RAILWAY_GIT_COMMIT_SHA", "local"),
        "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID", ""),
    }
