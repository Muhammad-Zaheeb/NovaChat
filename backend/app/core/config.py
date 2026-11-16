from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict

_WEAK_SECRETS = {"", "change-me", "changeme", "secret"}


def normalize_database_url(url: str) -> str:
    """Accept what hosts hand out (postgres://, postgresql://, ?sslmode=require, Neon's
    channel_binding) and return a postgresql+asyncpg:// URL that asyncpg understands."""
    parts = urlsplit(url)
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"
    query = []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        if k == "channel_binding":
            continue  # libpq-only option
        if k == "sslmode":
            k, v = "ssl", v  # asyncpg spells it `ssl`
        query.append((k, v))
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: str = "development"  # "production" turns on HSTS and strict startup checks
    DATABASE_URL: str
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_POOL_RECYCLE: int = 300  # seconds; serverless Postgres drops idle connections
    # Built frontend (Vite `dist`). Served at / when the directory exists.
    FRONTEND_DIST: str = "../frontend/dist"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    COOKIE_SECURE: bool = False
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    # Behind a reverse proxy (Render): trust X-Forwarded-For for the client IP.
    TRUST_PROXY: bool = False
    TRUSTED_PROXY_HOPS: int = 1

    EMAIL_BACKEND: str = "console"  # console | smtp | brevo
    BREVO_API_KEY: str = ""
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

    @property
    def is_production(self) -> bool:
        return self.ENV.lower() == "production"

    @property
    def async_database_url(self) -> str:
        return normalize_database_url(self.DATABASE_URL)

    def check_production(self) -> list[str]:
        """Problems that make a production deploy unsafe (empty list = fine)."""
        bad = []
        if self.SECRET_KEY in _WEAK_SECRETS or len(self.SECRET_KEY) < 32:
            bad.append("SECRET_KEY must be a random string of at least 32 characters")
        if not self.COOKIE_SECURE:
            bad.append("COOKIE_SECURE must be true (cookies need HTTPS)")
        if self.STORAGE_BACKEND == "local":
            bad.append("STORAGE_BACKEND=local loses files on ephemeral hosts; use s3")
        return bad


settings = Settings()
