from app.core.security import get_current_user
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.schemas.track import TrackCreate, TrackResponse, TrackUpdate
from app.models.track import Track
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
    db : Session= Depends(get_db),
    current_user : User = Depends(get_current_user)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code = 404,
            details = "User not found"
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
    track = db.query(Track).filter(Track.id == track.id).first()

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
    track.name = updated_data.name
    db.commit
    db.refresh(track)

    return track

@router.get("/streak/{track_id}")
def get_streak(
    track_id : int,
    db : Session = Depends(get_db)
):
    #check track exist
    track = db.query(Track).filter(Track.id == track_id).first()
    if not  track:
        raise HTTPException(
            status_code = 404,
            details =  "Track not found"
        )
    
    #return streak values
    return {
        "current_streak" : track.current_streak or 0,
        "longest_streak" : track.longest_streak or 0
    }
