from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    GEMINI_API_KEY: str = "AIzaSyDVIDk7PkUDktJqWOkFKIij_O9S9tpCjQw"

    class Config:
        env_file = ".env"
        extra = "allow"   # extra fields ignore karega

settings = Settings()