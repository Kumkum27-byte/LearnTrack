from pydantic import BaseModel, EmailStr
from datetime import datetime

class UserCreate(BaseModel):
    name : str
    email : EmailStr
    password : str

class UserResponse(BaseModel):
    id : int
    name : str
    email : EmailStr
    created_at : datetime

    model_config = {
        "from_attributes": True
    }

