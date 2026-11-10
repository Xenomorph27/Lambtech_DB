"""Plain row operations over SQLAlchemy Core tables. Rows come back as dicts."""

from typing import Any, Optional
from uuid import UUID

from sqlalchemy import Table, delete, insert, select, update
from sqlalchemy.orm import Session


def _dict(row) -> dict:
    return dict(row._mapping)


def list_rows(
    db: Session,
    table: Table,
    filters: Optional[dict[str, Any]] = None,
    skip: int = 0,
    limit: int = 200,
    order_by=None,
) -> list[dict]:
    stmt = select(table)
    for column, value in (filters or {}).items():
        stmt = stmt.where(table.c[column] == value)
    stmt = stmt.order_by(*(order_by if order_by is not None else [table.c.created_at.desc()]))
    return [_dict(r) for r in db.execute(stmt.offset(skip).limit(limit))]


def get_row(db: Session, table: Table, row_id: UUID) -> Optional[dict]:
    row = db.execute(select(table).where(table.c.id == row_id)).first()
    return _dict(row) if row else None


def create_row(db: Session, table: Table, data: dict) -> dict:
    # Leave out Nones so the database applies its own defaults (currency,
    # status, serial numbers, trigger-filled columns).
    values = {k: v for k, v in data.items() if v is not None}
    row = db.execute(insert(table).values(**values).returning(table)).first()
    db.commit()
    return _dict(row)


def update_row(db: Session, table: Table, row_id: UUID, data: dict) -> Optional[dict]:
    if not data:
        return get_row(db, table, row_id)
    row = db.execute(update(table).where(table.c.id == row_id).values(**data).returning(table)).first()
    db.commit()
    return _dict(row) if row else None


def delete_row(db: Session, table: Table, row_id: UUID) -> bool:
    result = db.execute(delete(table).where(table.c.id == row_id))
    db.commit()
    return result.rowcount > 0
