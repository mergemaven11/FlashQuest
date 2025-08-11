from sqlmodel import SQLModel, create_engine, Session
from .config import settings

# SQLAlchemy/SQLModel database engine
engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

def get_session():
    """
    Yield a database session.

    Intended to be used as a FastAPI dependency in route handlers so that
    each request has its own database session context.

    Yields:
        Session: An active SQLModel/SQLAlchemy session.
    """
    with Session(engine) as session:
        yield session

def init_db():
    """
    Initialize the database schema.

    Creates all tables defined in SQLModel metadata if they do not exist.

    Returns:
        None
    """
    SQLModel.metadata.create_all(engine)
