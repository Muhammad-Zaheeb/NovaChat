"""Small built-in list of throwaway-mail domains rejected at registration."""
DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org",
    "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net",
    "tempmail.com", "temp-mail.org", "tempmail.net", "yopmail.com", "yopmail.net",
    "trashmail.com", "throwawaymail.com", "getnada.com", "maildrop.cc",
    "dispostable.com", "fakeinbox.com", "mailnesia.com",
}


def is_disposable(email: str) -> bool:
    return email.rsplit("@", 1)[-1].lower() in DISPOSABLE_DOMAINS
