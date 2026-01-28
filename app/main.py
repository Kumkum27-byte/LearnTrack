from fastapi import FastAPI
from fastapi import APIRouter, HTTPSException
from pydantic import BaseModel, EmailStr
from datetime import date
from app.schema.user import UserCreate, Userlogin

#Create FastAPI instance
app = FastAPI()

#schema/user.py
class UsercCreate(BaseModel):
    email : EmailStr
    password : str

class Userlogin(BaseModel):
    email : EmailStr
    password : str

#schema/learning.py
class LearningLogCreate(BaseModel):
    date : date
    topic : str
    time_spent_minutes : int

class LearningLogResponse(BaseModel):
    date : date
    topic : str
    time_spent_minutes : str


app = APIRouter(prefix="/auth", tags=["auth"])

user = {}

#Routes
@app.get("/")
def root():
    return{"message" : "Welcome to the FastAPI application!"}

@app.post("/signup")
def signup(user_create: UserCreate):
    if user_create.email in user:
        raise HTTPSException(status_code=400, detail="User already exists")
    user[user_create.email] = {
        "password" : user_create.password
    }
