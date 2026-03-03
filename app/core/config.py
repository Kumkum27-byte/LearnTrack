from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    HF_TOKEN: str
    DATABASE_URL: str

    class Config:
        env_file = ".env"
        extra = "allow"   # extra fields ignore karega

settings = Settings()