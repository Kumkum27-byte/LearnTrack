from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
from app.routers.user import router as user_router
from app.routers.track import router as track_router
from app.routers.log import router as log_router
from app.database import Base
from app.routers import auth

Base.metadata.create_all(bind=engine)


#app instance
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(user_router)
app.include_router(track_router)
app.include_router(log_router)

@app.get("/")
def read_root():
    return {"message": "Database Connected!"}