import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

# Load server-side environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Mashal EMS Intelligence — Energy Management System")
    VERSION: str = os.getenv("VERSION", "1.0.0")
    API_V1_PREFIX: str = "/api"
    
    # Security & Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "ems_intelligence_production_secret_key_2026_secured_mashal")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 12 # 12 hours (matches one full shift)
    
    # Database: SQLite by default with PostgreSQL support
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./ems_data.db")

    # Dual-Account Corporate Email & SMTP Configuration
    PRIMARY_SMTP_USER: str = os.getenv("PRIMARY_SMTP_USER", "noreplykogm@gmail.com")
    PRIMARY_SMTP_PASSWORD: str = os.getenv("PRIMARY_SMTP_PASSWORD", "eywx ymyd xntx mtrt")
    SECONDARY_SMTP_USER: str = os.getenv("SECONDARY_SMTP_USER", "chd.kogm@gmail.com")
    SECONDARY_SMTP_PASSWORD: str = os.getenv("SECONDARY_SMTP_PASSWORD", "piqv wcut yvxj mibn")
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    
    # Motor Rating Constants from Plant Specification (Handwritten Engineer Sheet)
    # 1 HP = 0.744 kW
    # 15-min slot rated energy (kWh) = (HP * 0.744) / 4
    HP_TO_KW_FACTOR: float = 0.744
    SLOT_HOURS: float = 0.25 # 15 minutes = 0.25 h
    
    RATED_15MIN_KWH: dict = {
        75: 75 * 0.744 / 4.0,   # 13.95 kWh (75 * 0.744 = 55.8 kW)
        60: 60 * 0.744 / 4.0,   # 11.16 kWh (60 * 0.744 = 44.64 kW)
        50: 50 * 0.744 / 4.0,   # 9.30 kWh  (50 * 0.744 = 37.2 kW)
        40: 40 * 0.744 / 4.0,   # 7.44 kWh  (40 * 0.744 = 29.76 kW)
        30: 30 * 0.744 / 4.0,   # 5.58 kWh
    }
    
    # Motor Health Ranges (From Plant Engineer Operating Rules)
    IDLE_MIN_PCT: float = 10.0
    IDLE_MAX_PCT: float = 40.0
    HEALTHY_MIN_PCT: float = 50.0
    HEALTHY_MAX_PCT: float = 80.0
    OVERLOAD_THRESHOLD_PCT: float = 80.0 # > 80% is overload risk
    EXTREME_SPIKE_THRESHOLD_KWH: float = 100.0 # Single interval reading > 100 kWh for sub-feeders / motors
    
    # File Uploads & Retention Policy
    MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024 # 50 MB
    ALLOWED_EXTENSIONS: list[str] = [".xlsx", ".xls"]
    MAX_RETAINED_REPORTS: int = int(os.getenv("MAX_RETAINED_REPORTS", "30")) # FIFO auto-delete threshold
    
    class Config:
        case_sensitive = True

settings = Settings()
