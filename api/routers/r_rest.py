from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from sqlalchemy.orm import Session

from database import get_db
from services.rest_query import (
    ALLOWED_TABLES,
    delete_rows,
    insert_rows,
    query_rows,
    update_rows,
)

router = APIRouter(prefix="/rest/v1", tags=["REST"])


def _table_or_404(name: str) -> str:
    if name not in ALLOWED_TABLES:
        raise HTTPException(404, f"Table {name} not found")
    return name


def _format_select_response(rows: list, accept: str | None):
    wants_object = accept and "application/vnd.pgrst.object+json" in accept
    if wants_object:
        if len(rows) == 1:
            return rows[0]
        raise HTTPException(
            406,
            {
                "code": "PGRST116",
                "message": "JSON object requested, multiple (or no) rows returned",
                "details": f"Results contain {len(rows)} rows",
            },
        )
    return rows


@router.get("/{table}")
def rest_select(
    table: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    accept: str | None = Header(default=None),
    prefer: str | None = Header(default=None),
):
    _table_or_404(table)
    params = dict(request.query_params)
    rows = query_rows(db, table, params)
    if prefer and "count=exact" in prefer:
        response.headers["Content-Range"] = f"0-{max(0, len(rows) - 1)}/{len(rows)}"
    return _format_select_response(rows, accept)


@router.post("/{table}")
async def rest_insert(
    table: str,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    prefer: str | None = Header(default=None),
):
    _table_or_404(table)
    payload = await request.json()
    on_conflict = request.query_params.get("on_conflict")
    ignore_dup = prefer and "ignore-duplicates" in prefer
    merge = prefer and "merge-duplicates" in prefer
    rows = insert_rows(
        db,
        table,
        payload,
        on_conflict=on_conflict if (merge or ignore_dup) else None,
        ignore_dup=bool(ignore_dup),
    )
    if prefer and "return=representation" in prefer:
        response.status_code = 201
        if isinstance(payload, list):
            return rows
        return rows[0] if rows else {}
    response.status_code = 201
    return None


@router.patch("/{table}")
async def rest_update(
    table: str,
    request: Request,
    db: Session = Depends(get_db),
    prefer: str | None = Header(default=None),
):
    _table_or_404(table)
    payload = await request.json()
    params = dict(request.query_params)
    rows = update_rows(db, table, payload, params)
    if prefer and "return=representation" in prefer:
        return rows
    return rows


@router.delete("/{table}")
def rest_delete(table: str, request: Request, db: Session = Depends(get_db)):
    _table_or_404(table)
    params = dict(request.query_params)
    delete_rows(db, table, params)
    return Response(status_code=204)