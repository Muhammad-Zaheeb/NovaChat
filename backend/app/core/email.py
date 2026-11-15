"""Outgoing email. Backend chosen by settings.EMAIL_BACKEND:
  console - log the message (development default)
  smtp    - real delivery over STARTTLS (e.g. smtp.gmail.com:587)
  memory  - collect in `outbox` (tests)
"""
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("novachat.email")
outbox: list[dict] = []


def _build(to: str, subject: str, text: str, html: str) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    return msg


def send_email(to: str, subject: str, text: str, html: str, code: str | None = None) -> None:
    """Blocking; call from a background task. Never raises (failures are logged)."""
    backend = settings.EMAIL_BACKEND
    try:
        if backend == "smtp":
            msg = _build(to, subject, text, html)
            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as s:
                s.starttls()
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                s.send_message(msg)
        elif backend == "memory":
            outbox.append({"to": to, "subject": subject, "text": text, "code": code})
        else:
            log.warning("EMAIL (console) to=%s subject=%r\n%s", to, subject, text)
    except Exception:
        log.exception("Failed to send email to %s", to)


def send_verification_code(to: str, username: str, code: str) -> None:
    text = (
        f"Hi {username},\n\nYour NovaChat verification code is: {code}\n\n"
        "It expires in 10 minutes. If you didn't create a NovaChat account, "
        "you can ignore this email.\n\n— NovaChat"
    )
    html = (
        f"<p>Hi {username},</p><p>Your NovaChat verification code is:</p>"
        f"<p style=\"font-size:28px;font-weight:bold;letter-spacing:4px\">{code}</p>"
        "<p>It expires in 10 minutes. If you didn't create a NovaChat account, "
        "you can ignore this email.</p><p>— NovaChat</p>"
    )
    send_email(to, "Your NovaChat verification code", text, html, code=code)
