from datetime import datetime, timedelta, timezone
from typing import Optional

# Bin delay mapping in seconds (index 0 unused)
BIN_INTERVALS = [
    None,  # bin 0 (new card, no delay)
    5,     # bin 1
    25,    # bin 2
    120,   # bin 3
    600,   # bin 4
    3600,  # bin 5
    18000, # bin 6
    86400, # bin 7
    432000, # bin 8
    2160000, # bin 9
    10368000, # bin 10 (~4 months)
    None   # bin 11 (never review)
]

def next_review_time_for_bin(bin_: int) -> Optional[datetime]:
    """
    Calculate the next review datetime for a given bin.

    Args:
        bin_ (int): The current spaced repetition bin.

    Returns:
        Optional[datetime]: The datetime when the card should next be reviewed,
        or None if the bin represents 'never'.
    """
    secs = BIN_INTERVALS[bin_]
    if secs is None:
        return None
    return datetime.now(timezone.utc) + timedelta(seconds=secs)
