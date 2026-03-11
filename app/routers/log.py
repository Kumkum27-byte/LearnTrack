from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc
from datetime import timedelta, datetime

from app.database import get_db
from app.core.security import get_current_user

from app.database import get_db
from app.models.user import User
from app.models.track import Track
from app.models.daily_log import DailyLog
from app.models.ai import AIConversation

from app.schemas.log import LogCreate, LogResponse, LogUpdate, LogComplete

from app.services.ai import start_ai_interaction


router = APIRouter(
    prefix="/logs",
    tags=["Logs"]
)


# -----------------------------
# STREAK RECOMPUTATION
# -----------------------------

def recompute_track_streak(db: Session, track: Track):

    dates = db.query(DailyLog.date).filter(
        DailyLog.track_id == track.id
    ).distinct().all()

    date_values = sorted([row[0] for row in dates if row[0]])

    if not date_values:
        track.current_streak = 0
        track.longest_streak = 0
        return

    longest = 1
    run = 1

    for i in range(1, len(date_values)):
        if date_values[i] == date_values[i - 1] + timedelta(days=1):
            run += 1
        else:
            run = 1

        longest = max(longest, run)

    today = datetime.utcnow().date()
    date_set = set(date_values)

    current = 0
    cursor = today

    while cursor in date_set:
        current += 1
        cursor -= timedelta(days=1)

    track.current_streak = current
    track.longest_streak = longest


# -----------------------------
# DELETE LOG HELPER
# -----------------------------

def _delete_log_by_id(log_id: int, db: Session, current_user: User):

    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()

    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    track = db.query(Track).filter(Track.id == log.track_id).first()

    if not track or track.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    db.delete(log)
    db.flush()

    recompute_track_streak(db, track)

    db.commit()


# -----------------------------
# CREATE LOG
# -----------------------------

@router.post("/{track_id}", response_model=LogResponse, status_code=status.HTTP_201_CREATED)
def create_daily_log(
    track_id: int,
    log: LogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    logs_today_count = db.query(DailyLog).filter(
        DailyLog.track_id == track_id,
        DailyLog.date == log.date
    ).count()

    if logs_today_count >= 5:
        raise HTTPException(
        status_code=400,
        detail="Maximum 5 logs allowed per day"
        )

    new_log = DailyLog(
        date=log.date,
        minutes_spent=log.minutes_spent,
        notes=log.notes,
        track_id=track_id
    )

    db.add(new_log)
    db.flush()

    recompute_track_streak(db, track)

    db.commit()
    db.refresh(new_log)

    return new_log


# -----------------------------
# GET LOGS
# -----------------------------

@router.get("/{track_id}", response_model=list[LogResponse])
def get_logs_for_track(
    track_id: int,
    order: str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    track = db.query(Track).filter(
        Track.id == track_id,
        Track.user_id == current_user.id
    ).first()

    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    ordering = asc(DailyLog.date) if order == "asc" else desc(DailyLog.date)

    logs = db.query(DailyLog).filter(
        DailyLog.track_id == track_id
    ).order_by(ordering).all()

    return logs


# -----------------------------
# UPDATE LOG
# -----------------------------

@router.put("/{log_id}", response_model=LogResponse)
def update_daily_log(
    log_id: int,
    log_update: LogUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()

    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    track = db.query(Track).filter(Track.id == log.track_id).first()

    if not track or track.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    log.minutes_spent = log_update.minutes_spent
    log.notes = log_update.notes

    db.commit()
    db.refresh(log)

    return log


# -----------------------------
# DELETE LOG
# -----------------------------

@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_daily_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    _delete_log_by_id(log_id, db, current_user)


# -----------------------------
# COMPLETE LOG (AI TRIGGER)
# -----------------------------

@router.post("/{log_id}/complete")
def complete_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):

    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()

    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    track = db.query(Track).filter(Track.id == log.track_id).first()

    if not track or track.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")

    existing_ai = db.query(AIConversation).filter(
        AIConversation.log_id == log.id,
        AIConversation.role == "assistant"
    ).order_by(desc(AIConversation.created_at)).first()

    if log.completed and existing_ai:
        return {
            "message": "Yay!🎉you completed a log",
            "log_id": log.id,
            "ai_response": existing_ai.content
        }

    log.completed = True

    print("AI interaction started")
    ai_response = start_ai_interaction(log, db)

    db.commit()
    db.refresh(log)

    return {
        "message": "Log completed successfully",
        "log_id": log.id,
        "ai_response": ai_response
    }