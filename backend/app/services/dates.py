from datetime import date, datetime, timedelta, timezone

# America/Sao_Paulo has no daylight saving time; UTC−3 is the civil offset.
APP_TIMEZONE = timezone(timedelta(hours=-3), name="America/Sao_Paulo")


def app_today() -> date:
    """Calendar date used by balances, in the application's local timezone."""
    return datetime.now(APP_TIMEZONE).date()
