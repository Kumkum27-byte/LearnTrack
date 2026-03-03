from sqlalchemy import Column, Integer, Date, Boolean, ForeignKey, String
from sqlalchemy.orm import relationship
from app.database import Base
from app.models.ai import AIConversation
import datetime

class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    minutes_spent = Column(Integer, nullable=False)
    date = Column(Date, default=datetime.date.today)
    notes = Column(String, nullable=True)

    completed = Column(Boolean, default=False)
    track_id = Column(Integer, ForeignKey("tracks.id"))

    # Relationship
    track = relationship("Track", back_populates="daily_logs")
    conversations = relationship(AIConversation, back_populates="daily_log")