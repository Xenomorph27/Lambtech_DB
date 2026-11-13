from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import errors
from auth import require_staff
from routers import enquiries, resources, stats
from settings import settings

app = FastAPI(
    title="LambTech Desk",
    description=(
        "Outreach, replies, leads and ongoing work for LambTech. The database "
        "holds every rule; this API is a thin, authenticated door to it."
    ),
    version="0.1.0",
)

# CORS: an explicit origin list, never "*" (a wildcard cannot be combined with
# the Authorization header the frontend sends on every call).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

errors.install(app)

# Every resource router is mounted behind require_staff here, at mount time,
# so a router added later cannot be left open by forgetting a decorator.
STAFF_ONLY = [Depends(require_staff)]

for router in resources.ALL:
    app.include_router(router, dependencies=STAFF_ONLY)
app.include_router(stats.router, dependencies=STAFF_ONLY)
app.include_router(enquiries.router, dependencies=STAFF_ONLY)


@app.get("/me", tags=["auth"])
def me(staff: dict = Depends(require_staff)):
    """Who the frontend is signed in as; also how it checks a login is accepted."""
    return staff


@app.get("/health", tags=["health"])
def health():
    """Liveness probe. No database call, so a database blip does not read as the API being down."""
    return {"status": "ok", "version": app.version}
