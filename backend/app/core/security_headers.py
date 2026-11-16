"""Security headers for every HTTP response (WebSocket upgrades bypass this middleware)."""
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.config import settings


def _csp() -> str:
    img = ["'self'", "data:", "blob:"]
    if settings.S3_PUBLIC_BASE_URL:
        u = urlsplit(settings.S3_PUBLIC_BASE_URL)
        img.append(f"{u.scheme}://{u.netloc}")
    connect = ["'self'", "https://*.ingest.sentry.io", "https://*.ingest.us.sentry.io", "https://*.ingest.de.sentry.io"]
    return "; ".join(
        [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",  # React inline style attributes
            f"img-src {' '.join(img)}",
            "media-src 'self' blob:",
            "font-src 'self' data:",
            f"connect-src {' '.join(connect)}",
            "worker-src 'self' blob:",
            "object-src 'none'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
        ]
    )


def headers() -> list[tuple[bytes, bytes]]:
    h = {
        "Content-Security-Policy": _csp(),
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
        "Cross-Origin-Opener-Policy": "same-origin",
    }
    if settings.is_production:
        h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return [(k.lower().encode(), v.encode()) for k, v in h.items()]


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        self._headers = headers()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        async def wrapped(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {k.lower() for k, _ in message["headers"]}
                message["headers"] = list(message["headers"]) + [
                    kv for kv in self._headers if kv[0] not in existing
                ]
            await send(message)

        await self.app(scope, receive, wrapped)
