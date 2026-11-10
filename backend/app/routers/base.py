"""
One factory for every resource router.

Each resource gets the same five routes (list, get one, create, update,
delete) over its table, with an optional view to read from so that a write
comes back carrying the view's computed columns, and a whitelist of query
parameters that may filter the list.
"""

from typing import Optional, Sequence, Type
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import Table, Uuid
from sqlalchemy.orm import Session

import crud
from database import get_db


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found.")


def _filter_values(table: Table, allowed: Sequence[str], request: Request) -> dict:
    values = {}
    for name, raw in request.query_params.items():
        if name not in allowed or raw == "":
            continue
        column = table.c[name]
        if isinstance(column.type, Uuid):
            try:
                raw = UUID(raw)
            except ValueError:
                raise HTTPException(status_code=422, detail=f"{name} must be a UUID.")
        values[name] = raw
    return values


def make_crud_router(
    prefix: str,
    label: str,
    table: Table,
    read_model: Type[BaseModel],
    create_model: Type[BaseModel],
    update_model: Optional[Type[BaseModel]] = None,
    filters: Sequence[str] = (),
    read_table: Optional[Table] = None,
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[label])
    source = read_table if read_table is not None else table

    def read_one(db: Session, row_id: UUID) -> dict:
        row = crud.get_row(db, source, row_id)
        if row is None:
            raise _not_found(label)
        return row

    @router.get("", response_model=list[read_model])
    def list_rows(
        request: Request,
        skip: int = Query(0, ge=0),
        limit: int = Query(200, ge=1, le=1000),
        db: Session = Depends(get_db),
    ):
        return crud.list_rows(db, source, _filter_values(source, filters, request), skip, limit)

    @router.get("/{row_id}", response_model=read_model)
    def get_row(row_id: UUID, db: Session = Depends(get_db)):
        return read_one(db, row_id)

    @router.post("", response_model=read_model, status_code=status.HTTP_201_CREATED)
    def create_row(body: create_model, db: Session = Depends(get_db)):
        row = crud.create_row(db, table, body.model_dump())
        return read_one(db, row["id"]) if read_table is not None else row

    if update_model is not None:

        @router.patch("/{row_id}", response_model=read_model)
        def update_row(row_id: UUID, body: update_model, db: Session = Depends(get_db)):
            row = crud.update_row(db, table, row_id, body.model_dump(exclude_unset=True))
            if row is None:
                raise _not_found(label)
            return read_one(db, row_id) if read_table is not None else row

    @router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_row(row_id: UUID, db: Session = Depends(get_db)):
        if not crud.delete_row(db, table, row_id):
            raise _not_found(label)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
