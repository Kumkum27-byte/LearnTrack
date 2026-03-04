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

    model_config = {
        "from_attributes": True
    }

class TrackUpdate(BaseModel):
    title: str
    start_date : date
    end_date : date