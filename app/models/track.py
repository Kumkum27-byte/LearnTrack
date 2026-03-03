from sqlalchemy import Column, Integer, String, ForeignKey, Date
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import date


class Track(Base):
    __tablename__ = "tracks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    start_date = Column(Date, default=date.today)
    end_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="active")
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)

    user_id = Column(Integer, ForeignKey("users.id"))

    # Relationships
    user = relationship("User", back_populates="tracks")
    daily_logs = relationship("DailyLog", back_populates="track", cascade="all, delete")
    streak = relationship("Streak", back_populates="track", uselist=False, cascade="all, delete")