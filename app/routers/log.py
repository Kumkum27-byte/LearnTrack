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
    
    #check duplicate log
    existing_log = db.query(DailyLog).filter(DailyLog.track_id == track_id, DailyLog.date==log.date).first()
    if existing_log:
        raise HTTPException(
            status_code = 400,
            detail = "Log for this date already exists"
        )
    
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

    #Streak Logic
    previous_date = log.date-timedelta(days=1)

    prev_log = db.query(DailyLog).filter(DailyLog.track_id == track_id, DailyLog.date == previous_date).first()
    if prev_log:
        track.current_streak+=1
    else:
        track.current_streak=1
    
    track.longest_streak = max(
        track.longest_streak, track.current_streak
    )

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