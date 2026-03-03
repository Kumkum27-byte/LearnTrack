from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Streak(Base):
    __tablename__ = "streaks"

    id = Column(Integer, primary_key=True, index=True)
    current_streak = Column(Integer, default=0)
    longest_streak = Column(Integer, default=0)

    track_id = Column(Integer, ForeignKey("tracks.id"), unique=True)

    # Relationship
    track = relationship("Track", back_populates="streak")