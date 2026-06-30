from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
import os
import sys
import logging
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

logger = logging.getLogger(__name__)

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    logger.warning("python-dotenv not installed, reading from system env only")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    logger.critical("DATABASE_URL tidak diset di .env atau environment variable")
    sys.exit(1)

if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

try:
    import psycopg2  # noqa: F401

    PG_DRIVER = "psycopg2"
    logger.info("Using psycopg2 driver")
except ImportError:
    try:
        import psycopg  # noqa: F401

        PG_DRIVER = "psycopg"
        logger.info("Using psycopg (v3) driver")
    except ImportError:
        logger.critical("No PostgreSQL driver found. Install psycopg2-binary or psycopg[binary]")
        sys.exit(1)


def _clean_db_url(url: str) -> str:
    parsed = urlparse(url)
    if not parsed.query:
        return url
    unsupported = {"pgbouncer", "sslmode", "application_name"}
    kept = {k: v for k, v in parse_qs(parsed.query).items() if k not in unsupported}
    clean_query = urlencode(kept, doseq=True)
    cleaned = urlunparse(parsed._replace(query=clean_query))
    if cleaned != url:
        logger.info("Stripped unsupported query params from DATABASE_URL")
    return cleaned


clean_url = _clean_db_url(DATABASE_URL)

if PG_DRIVER == "psycopg" and not clean_url.startswith("postgresql+psycopg"):
    clean_url = clean_url.replace("postgresql://", "postgresql+psycopg://", 1)

engine = create_engine(
    clean_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    pool_timeout=10,
    connect_args={"connect_timeout": 10},
)
logger.info("Connected to PostgreSQL")

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()