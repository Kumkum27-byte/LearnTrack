from datetime import date
from pydantic import BaseModel

class TrackCreate(BaseModel):
    title : str
    start_date : date
    end_date : date

class TrackResponse(BaseModel):
    id : int
    title : str
    start_date : date
    end_date : date
    status : str

class TrackUpdate(BaseModel):
    title: str
    start_date : date
    end_date : date

class Config:
    from_attributes = True