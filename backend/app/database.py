from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from settings import settings

if not settings.database_url:
    raise RuntimeError("DATABASE_URL is not set. Copy backend/app/.env.example to .env and fill it in.")

# pool_pre_ping: Supabase's pooler closes idle connections; without a ping the
# first request after a quiet spell fails instead of reconnecting.
engine = create_engine(settings.database_url, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
