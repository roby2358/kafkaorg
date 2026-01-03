"""Database connection and initialization"""
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

Base = declarative_base()

# Database connection settings
DB_HOST = "localhost"
DB_PORT = 5432
DB_USER = "postgres"
DB_PASSWORD = "postgres"
DB_NAME = "kafkaorg"

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(DATABASE_URL, poolclass=NullPool)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database schema by running schema.sql"""
    schema_file = Path(__file__).parent.parent / "db" / "schema.sql"
    
    if not schema_file.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_file}")
    
    with open(schema_file, "r") as f:
        schema_sql = f.read()
    
    # Use raw connection to execute multiple statements
    conn = engine.raw_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(schema_sql)
        conn.commit()
        cursor.close()
    finally:
        conn.close()
    
    print(f"Database schema initialized from {schema_file}")


def get_db():
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
