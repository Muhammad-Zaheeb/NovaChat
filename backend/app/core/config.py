from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    COOKIE_SECURE: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    EMAIL_BACKEND: str = "console"  # console | smtp
    EMAIL_FROM: str = "NovaChat <no-reply@localhost>"
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # File storage: "local" (dev, files under UPLOAD_DIR) or "s3" (S3-compatible, e.g. Cloudflare R2)
    STORAGE_BACKEND: str = "local"
    UPLOAD_DIR: str = "uploads"  # relative to the backend directory
    S3_ENDPOINT_URL: str = ""
    S3_BUCKET: str = ""
    S3_ACCESS_KEY_ID: str = ""
    S3_SECRET_ACCESS_KEY: str = ""
    S3_REGION: str = "auto"
    S3_PUBLIC_BASE_URL: str = ""  # optional: serve avatars straight from a public bucket/CDN
    UPLOADS_PER_MINUTE: int = 30


settings = Settings()
