from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date

class LogCreate(BaseModel):
    date : date
    minutes_spent : int
    notes: Optional[str] = None

class LogUpdate(BaseModel):
    minutes_spent : int
    notes : Optional[str] = None

class LogComplete(BaseModel):
    completed:bool

class LogResponse(BaseModel):
    id : int
    date : date
    minutes_spent : int
    notes: Optional[str] = None

    model_config = {
        "from_attributes" : True
    }