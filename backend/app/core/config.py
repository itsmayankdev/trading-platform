from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Trading Platform API"

    database_url: str
    redis_url: str

    binance_api_key: str = ""
    binance_api_secret: str = ""

    # Owner-only control plane. Keep these outside source control in production.
    admin_email: str = ""
    admin_password: str = ""
    admin_session_secret: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
