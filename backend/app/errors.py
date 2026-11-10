"""
Turn database refusals into useful HTTP answers.

Every business rule lives in Postgres (unique emails, delete rules, check
constraints, trigger checks), so a refused write arrives here as a driver
error with a SQLSTATE code. Mapping the codes once, centrally, means no
router has to anticipate them.
"""

import re

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, OperationalError

UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"
RESTRICT_VIOLATION = "23001"
NOT_NULL_VIOLATION = "23502"
CHECK_VIOLATION = "23514"
INVALID_TEXT_REPRESENTATION = "22P02"
RAISE_EXCEPTION = "P0001"

_DETAIL = re.compile(r"DETAIL:\s*(.*)")


def _message(exc: DBAPIError) -> str:
    """Postgres' primary message, without the driver's context lines."""
    orig = getattr(exc, "orig", None)
    diag = getattr(orig, "diag", None)
    if diag is not None and diag.message_primary:
        return diag.message_primary
    return str(orig or exc).splitlines()[0]


def _key_detail(exc: DBAPIError) -> str:
    match = _DETAIL.search(str(exc.orig))
    return match.group(1) if match else ""


def map_db_error(exc: DBAPIError, method: str):
    # The database could not be reached or refused the login. Answered here,
    # inside the app, so the reply carries CORS headers: an unhandled 500
    # leaves without them and the browser misreports it as a network failure.
    if isinstance(exc, OperationalError) and getattr(exc.orig, "pgcode", None) is None:
        return 503, "The database is unreachable or refused the connection. Check DATABASE_URL on the server."
    code = getattr(getattr(exc, "orig", None), "pgcode", None)
    if code == UNIQUE_VIOLATION:
        return 409, f"That already exists: {_key_detail(exc) or _message(exc)}"
    if code in (FOREIGN_KEY_VIOLATION, RESTRICT_VIOLATION):
        if method == "DELETE":
            return 409, "This record still has related records, so it cannot be deleted."
        return 409, "This refers to a record that does not exist."
    if code in (CHECK_VIOLATION, NOT_NULL_VIOLATION, INVALID_TEXT_REPRESENTATION, RAISE_EXCEPTION):
        return 422, _message(exc)
    return None


def install(app: FastAPI) -> None:
    @app.exception_handler(DBAPIError)
    async def _db_error(request: Request, exc: DBAPIError):
        mapped = map_db_error(exc, request.method)
        if mapped is None:
            raise exc
        status_code, detail = mapped
        return JSONResponse(status_code=status_code, content={"detail": detail})
