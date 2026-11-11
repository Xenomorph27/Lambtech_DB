import os
import re
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

DOTENV = os.path.join(os.path.dirname(__file__), ".env")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=DOTENV, extra="ignore")

    # Supabase session-pooler URL (postgresql://postgres.<ref>:<password>@...:5432/postgres).
    database_url: Optional[str] = None

    # Comma-separated browser origins allowed to call this API. A plain string,
    # not a list: pydantic-settings parses list fields as JSON and a bare URL
    # in .env would then stop the app from starting.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Staff login (Supabase Auth). Defaults to locked: a deployment that
    # forgets this setting refuses everyone rather than admitting everyone.
    auth_required: bool = True
    # e.g. https://yxhnejjquxiretpxxxvm.supabase.co - where the signing keys live.
    supabase_url: Optional[str] = None
    # Only for projects still signing tokens with the legacy shared secret (HS256).
    supabase_jwt_secret: Optional[str] = None
    # Only these people may use the desk. Separate with commas, new lines,
    # spaces or semicolons (Render's editor invites one address per line).
    staff_emails: str = ""

    @property
    def staff_email_set(self) -> set:
        return {e.lower() for e in re.split(r"[\s,;]+", self.staff_emails) if e}


settings = Settings()
