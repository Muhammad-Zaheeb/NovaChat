"""Sentry error tracking: a no-op unless SENTRY_DSN is set. No PII by default."""
import logging

from app.core.config import settings

log = logging.getLogger("novachat")

_SENSITIVE_HEADERS = {"cookie", "set-cookie", "authorization", "x-forwarded-for", "x-real-ip"}


def scrub(event: dict, hint: dict | None = None) -> dict:
    """Drop cookies, auth headers, bodies and query strings before an event leaves the server."""
    req = event.get("request")
    if req:
        req.pop("cookies", None)
        req.pop("data", None)
        req.pop("query_string", None)
        headers = req.get("headers")
        if isinstance(headers, dict):
            req["headers"] = {k: v for k, v in headers.items() if k.lower() not in _SENSITIVE_HEADERS}
    event.pop("user", None)
    return event


def init_sentry() -> bool:
    if not settings.SENTRY_DSN:
        return False
    import sentry_sdk

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENV,
        send_default_pii=False,
        traces_sample_rate=settings.SENTRY_TRACES_SAMPLE_RATE,
        before_send=scrub,
    )
    log.info("Sentry enabled")
    return True
