import re


PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_BYTES = 72

_COMMON_PASSWORDS = {
    "123456789012",
    "administrador",
    "password1234",
    "qwerty123456",
    "senha123456",
}


def validate_password_strength(password: str, *, name: str = "", email: str = "") -> str:
    """Validate passwords before bcrypt, which only accepts up to 72 bytes."""
    if len(password) < PASSWORD_MIN_LENGTH:
        raise ValueError(f"Password must be at least {PASSWORD_MIN_LENGTH} characters long")
    if len(password.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError("Password is too long")

    normalized = password.casefold()
    if normalized in _COMMON_PASSWORDS or len(set(normalized)) == 1:
        raise ValueError("Password is too easy to guess")

    personal_terms = [part.casefold() for part in re.findall(r"[\w]+", name) if len(part) >= 4]
    email_local = email.partition("@")[0].casefold()
    if len(email_local) >= 4:
        personal_terms.append(email_local)
    if any(term in normalized for term in personal_terms):
        raise ValueError("Password must not contain your name or email")

    return password
