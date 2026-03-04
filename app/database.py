from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit = False,
    autoflush = False,
    bind = engine
)

Base = declarative_base()

def ensure_daily_logs_created_at_column():
    """Add and backfill daily_logs.created_at for existing SQLite databases."""
    if engine.dialect.name != "sqlite":
        return

    with engine.begin() as connection:
        columns = connection.exec_driver_sql("PRAGMA table_info(daily_logs)").fetchall()
        column_names = {str(col[1]).lower() for col in columns}

        if "created_at" not in column_names:
            connection.exec_driver_sql("ALTER TABLE daily_logs ADD COLUMN created_at DATETIME")

        connection.exec_driver_sql(
            """
            UPDATE daily_logs
            SET created_at = COALESCE(created_at, CASE
                WHEN date IS NOT NULL THEN date || ' 00:00:00'
                ELSE CURRENT_TIMESTAMP
            END)
            WHERE created_at IS NULL
            """
        )

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
