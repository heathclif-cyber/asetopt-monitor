import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import SessionLocal
from routers.r_auth import router as auth_router
from routers.r_documents import router as documents_router
from routers.r_pembayaran import router as pembayaran_router
from routers.r_rest import router as rest_router
from routers.r_superman import router as superman_router
from services.auth_service import ensure_app_users_table, seed_default_users

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AsetOpt Monitor API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(os.path.join(os.path.dirname(__file__), "uploads"), exist_ok=True)

app.include_router(auth_router)
app.include_router(rest_router)
app.include_router(pembayaran_router)
app.include_router(documents_router)
app.include_router(superman_router)


@app.on_event("startup")
def on_startup():
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