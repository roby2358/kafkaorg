"""SQLAlchemy models"""
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from kafkaorg.db import Base


class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created = Column(DateTime, nullable=False, server_default=func.current_timestamp())
    updated = Column(DateTime, nullable=False, server_default=func.current_timestamp(), onupdate=func.current_timestamp())
