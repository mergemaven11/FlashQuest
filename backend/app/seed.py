"""
Seed a few example cards into the database.

Run (Docker):
    docker compose exec api python -m app.seed
"""

from sqlmodel import Session, select
from .db import engine
from .models import Card, UserCard

SAMPLE = [
    ("abate", "to become less intense or widespread"),
    ("benevolent", "well meaning and kindly"),
    ("candid", "truthful and straightforward; frank"),
]

def run() -> None:
    with Session(engine) as s:
        for word, definition in SAMPLE:
            exists = s.exec(select(Card).where(Card.word == word)).first()
            if exists:
                continue
            card = Card(word=word, definition=definition)
            s.add(card); s.commit(); s.refresh(card)
            s.add(UserCard(card_id=card.id, bin=0))
        s.commit()

if __name__ == "__main__":
    run()

