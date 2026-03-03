from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import user
from app.schemas.user import UserCreate, UserResponse
from app.models.user import User
from passlib.context import CryptContext

#router instance
router = APIRouter(
    prefix="/users",
    tags=["users"]
)

#database session dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

#password hashing setup
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

#POST endpoint
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user: UserCreate, db: Session= Depends(get_db)
    ):
    existing_user = db.query(User).filter(User.email == user.email).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Email already registered"
        )
    
    hashed_pwd = hash_password(user.password)

    new_user=User(
        name = user.name, 
        email = user.email, 
        password = hashed_pwd
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user

@router.get("/", response_model=list[UserResponse])
def get_users(db:Session = Depends(get_db)):
    users = db.query(User).all()
    return users

@router.get("/{user_id}", response_model=UserResponse)
def get_user_by_id(
    user_id : int,
    db : Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        raise HTTPException (
            status_code=404,
            detail="User not found"
        )
    return user