from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    bot_token: str = ""
    bot_username: str = ""
    admin_ids: str = ""
    telegram_webhook_secret: str = ""
    webhook_base_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_bucket: str = "books"
    frontend_origin: str = "http://localhost:5173"
    app_name: str = "Yuksalamiz"

    # Yuklash va PDF ishlovi
    max_book_upload_mb: int = 2048
    page_target_width: int = 1100      # reader uchun sahifa kengligi (px)
    page_jpeg_quality: int = 78
    cover_width: int = 420             # katalog muqovasi kengligi (px)
    upload_concurrency: int = 4        # Storage'ga parallel yuklash soni

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def admins(self) -> set[int]:
        result = set()
        for value in self.admin_ids.split(","):
            value = value.strip()
            if value.isdigit():
                result.add(int(value))
        return result

    @property
    def origins(self) -> list[str]:
        """FRONTEND_ORIGIN vergul bilan ajratilgan bir nechta manzil bo'lishi mumkin."""
        return [o.strip().rstrip("/") for o in self.frontend_origin.split(",") if o.strip()]

    @property
    def webapp_url(self) -> str:
        origins = self.origins
        return origins[0] if origins else ""

    @property
    def supabase_base(self) -> str:
        return self.supabase_url.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
