from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = Field("127.0.0.1", alias="ARTIFACT_HUB_HOST")
    port: int = Field(8787, alias="ARTIFACT_HUB_PORT")
    public_base_url: str = Field("http://127.0.0.1:8787", alias="ARTIFACT_HUB_PUBLIC_BASE_URL")
    database_url: str = Field(
        "postgresql+psycopg://artifact_hub:artifact_hub@127.0.0.1:5432/artifact_hub",
        alias="DATABASE_URL",
    )
    data_dir: Path = Field(Path("./data"), alias="ARTIFACT_HUB_DATA_DIR")
    admin_password: str = Field("change-me", alias="ARTIFACT_HUB_ADMIN_PASSWORD")
    session_secret: str = Field("replace-with-a-random-32-byte-secret", alias="ARTIFACT_HUB_SESSION_SECRET")
    default_visibility: str = Field("token", alias="ARTIFACT_HUB_DEFAULT_VISIBILITY")
    default_ttl_days: int = Field(0, alias="ARTIFACT_HUB_DEFAULT_TTL_DAYS")
    max_upload_mb: int = Field(100, alias="ARTIFACT_HUB_MAX_UPLOAD_MB")
    max_bundle_files: int = Field(2000, alias="ARTIFACT_HUB_MAX_BUNDLE_FILES")
    max_bundle_unzipped_mb: int = Field(300, alias="ARTIFACT_HUB_MAX_BUNDLE_UNZIPPED_MB")
    raw_csp_mode: str = Field("strict", alias="ARTIFACT_HUB_RAW_CSP_MODE")

    @field_validator("public_base_url")
    @classmethod
    def strip_base_url(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_bundle_unzipped_bytes(self) -> int:
        return self.max_bundle_unzipped_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
