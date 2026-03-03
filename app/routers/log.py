from app.core.security import get_current_user
from app.models.user import User
from app.models.track import Track
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import asc, desc
from datetime import timedelta, datetime
from app.services.ai import start_ai_interaction

from app.database import get_db
from app.models import track
from app.models.daily_log import DailyLog
from app.schemas.log import LogCreate, LogResponse, LogUpdate, LogComplete

router = APIRouter(
    prefix="/logs",
    tags=["Logs"]
)


def _delete_log_by_id(log_id: int, db: Session, current_user: User):
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        raise HTTPException(
            status_code=404,
            detail="Log not found"
        )

    track = db.query(Track).filter(Track.id == log.track_id).first()
    if not track or track.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden"
        )

    db.delete(log)
    db.flush()

    recompute_track_streak(db, track)
    db.commit()
    return

def recompute_track_streak(db: Session, track: Track):
    dates = db.query(DailyLog.date).filter(DailyLog.track_id == track.id).distinct().all()
    date_values = sorted([row[0] for row in dates if row and row[0]])

    if not date_values:
        track.current_streak = 0
        track.longest_streak = 0
        return

    # longest streak across all logged dates
    longest = 1
    run = 1
    for i in range(1, len(date_values)):
        if date_values[i] == date_values[i - 1] + timedelta(days=1):
            run += 1
        else:
            run = 1
        if run > longest:
            longest = run

    # current streak should end at today (auto-resets after missed day)
    today = datetime.utcnow().date()
    date_set = set(date_values)
    current = 0
    cursor = today
    while cursor in date_set:
        current += 1
        cursor -= timedelta(days=1)

    track.current_streak = current
    track.longest_streak = longest

@router.post("/logs/{track_id}", response_model=LogResponse, status_code=status.HTTP_201_CREATED)
@router.post("/{track_id}", response_model=LogResponse, status_code=status.HTTP_201_CREATED)

def create_daily_log(
    track_id : int,
    log: LogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    #check track exists
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(
            status_code=404, 
            detail="Track not found"
        )
    
    #ownership enforcement
    if track.user_id != current_user.id:
        raise HTTPException(
            status_code = 403,
            detail = "Forbidden"
        )
    
    #check whether this is first log for the selected date
    existing_log_same_day = db.query(DailyLog).filter(
        DailyLog.track_id == track_id,
        DailyLog.date == log.date
    ).first()
    
    #create new log
    new_log = DailyLog(
        date = log.date,
        minutes_spent = log.minutes_spent,
        notes = log.notes,
        track_id = track_id
    )

    #save in database
    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    # Streak recomputation (only if a new day was introduced)
    if not existing_log_same_day:
        recompute_track_streak(db, track)
        db.commit()
    #return ressponse
    return new_log

@router.get("/logs/{track_id}", response_model=list[LogResponse])
@router.get("/{track_id}", response_model=list[LogResponse])
def get_logs_for_track(
    track_id : int,
    order : str = Query("asc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    
):
    track = db.query(Track).filter(Track.id == track_id, Track.user_id == current_user.id).first()
    if not track:
        raise HTTPException(
            status_code = 404,
            detail = "Track not found"
        )
    
    #ordering
    ordering = asc(DailyLog.date) if order == "asc" else desc(DailyLog.date)
    log = db.query(DailyLog).filter(DailyLog.track_id == track_id).order_by(ordering).all()
    
    return log

@router.put("/logs/{log_id}", response_model=LogResponse)
@router.put("/{log_id}", response_model=LogResponse)
def update_daily_log(
    log_id : int,
    log_update : LogUpdate,
    db : Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
    
):
    #chhceck if log exists
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()
    if not log:
        raise HTTPException(
            status_code = 404,
            detail = "Log not found"
        )
    
    #update allowed fields only
    log.minutes_spent = log_update.minutes_spent
    log.notes = log_update.notes

    db.commit()
    db.refresh(log)

    return log

@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_daily_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _delete_log_by_id(log_id, db, current_user)
    return


@router.post("/{log_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
@router.post("/logs/{log_id}/delete", status_code=status.HTTP_204_NO_CONTENT)
def delete_daily_log_via_post(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    _delete_log_by_id(log_id, db, current_user)
    return

#Log completion detection
@router.post("/{log_id}/complete")
def complete_log(log_id: int, db: Session = Depends(get_db)):
    
    # 🔎 Get log
    log = db.query(DailyLog).filter(DailyLog.id == log_id).first()

    if not log:
        raise HTTPException(status_code=404, detail="Log not found")

    # ✅ Mark as completed
    log.completed = True
    log.completed_at = datetime.utcnow()

    # 🤖 Call AI
    ai_response = start_ai_interaction(log, db)

    # 💾 Store AI response in DB
    log.ai_response = ai_response

    db.commit()
    db.refresh(log)

    return {
        "message": "Log completed successfully",
        "log_id": log.id,
        "ai_response": ai_response
    }