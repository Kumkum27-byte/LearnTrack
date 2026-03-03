from app.core.security import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timedelta

from app.database import get_db
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate
from app.models.track import Track
from app.models.daily_log import DailyLog
from app.models.user import User

router = APIRouter(
    prefix="/users",
    tags=["Tracks"]
)

@router.post("/{user_id}/tracks", response_model=TrackResponse, status_code=status.HTTP_201_CREATED)

def create_track(
        user_id : int,
        track : TrackCreate,
        db : Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    #user exist check
    user = db.query(User).filter(User.id==user_id).first()
    if not user:
        raise HTTPException(
            status_code = 404,
            detail = "User not found"
        )
    
    #track object
    new_track = Track(
        title = track.title,
        start_date = track.start_date,
        end_date = track.end_date,
        status = "active",
        user_id = current_user.id
    )

    #DB save
    db.add(new_track)
    db.commit()
    db.refresh(new_track)

    return new_track

@router.get("/{user_id}/tracks", response_model=list[TrackResponse])
def get_tracks(
    user_id: int,
    db : Session= Depends(get_db),
    current_user : User = Depends(get_current_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code = 404,
            detail = "User not found"
        )

    if user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden"
        )

    #query all tracks for this user
    tracks = db.query(Track).filter(Track.user_id == user_id).all()

    return tracks

@router.get("/tracks/{track_id}")
def get_single_track(
    track_id : int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    track = db.query(Track).filter(Track.id == track_id).first()

    if not track:
        raise HTTPException(
            status_code = 404,
            detail = "Track not found"
        )
    
    ##Ownership check
    if track.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail = "Forbidden"
        )
    
    return track                   


@router.put("/tracks/{track_id}")
def update_track(
    track_id : int,
    updated_data : TrackUpdate,
    db: Session = Depends(get_db),
    current_user : User = Depends(get_current_user)
):
    track = db.query(Track).filter(Track.id == track_id).first()

    if not track:
        raise HTTPException(
            status_code = 404,
            detail = "Track not found"
        )
    
    #Ownership validation
    if track.user_id != current_user.id:
        raise HTTPException(
            status_code = 403,
            detail = "Forbidden"
        )
    track.title = updated_data.title
    track.start_date = updated_data.start_date
    track.end_date = updated_data.end_date
    db.commit()
    db.refresh(track)

    return track

@router.get("/streak/{track_id}")
def get_streak(
    track_id : int,
    db : Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    #check track exist
    track = db.query(Track).filter(Track.id == track_id).first()
    if not  track:
        raise HTTPException(
            status_code = 404,
            detail =  "Track not found"
        )

    if track.user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Forbidden"
        )

    dates = db.query(DailyLog.date).filter(DailyLog.track_id == track.id).distinct().all()
    date_values = sorted([row[0] for row in dates if row and row[0]])

    if not date_values:
        track.current_streak = 0
        track.longest_streak = 0
        db.commit()
        return {
            "current_streak": 0,
            "longest_streak": 0
        }

    longest = 1
    run = 1
    for i in range(1, len(date_values)):
        if date_values[i] == date_values[i - 1] + timedelta(days=1):
            run += 1
        else:
            run = 1
        if run > longest:
            longest = run

    today = datetime.utcnow().date()
    date_set = set(date_values)
    current = 0
    cursor = today
    while cursor in date_set:
        current += 1
        cursor -= timedelta(days=1)

    track.current_streak = current
    track.longest_streak = longest
    db.commit()
    
    #return streak values
    return {
        "current_streak" : current,
        "longest_streak" : longest
    }
