"""Jour « télé » d'un match : un match à 1h du matin appartient à la soirée de la veille
(« nuit de mardi à mercredi »), comme on le regarde en France."""
from datetime import date, datetime, timedelta
from typing import Tuple

import pytz

from src.config import TIMEZONE

TZ = pytz.timezone(TIMEZONE)
NIGHT_END_HOUR = 7  # avant 7h : rattaché à la veille


def tv_day(dt_utc: datetime) -> Tuple[date, bool]:
    """(jour de diffusion, est-ce un match de nuit)."""
    local = dt_utc.astimezone(TZ)
    if local.hour < NIGHT_END_HOUR:
        return local.date() - timedelta(days=1), True
    return local.date(), False
