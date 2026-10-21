from datetime import datetime, timedelta, timezone


def business_today():
    # Makassar stays on UTC+8; this also works in images without IANA tzdata.
    return datetime.now(timezone(timedelta(hours=8))).date()
