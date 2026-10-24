import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
SAMPLE_EVAL_DIR = BASE_DIR / "sample_data" / "evaluation"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


class Settings:
    APP_NAME: str = "Parallax Flow — Provisional AI Evaluation & Faculty Audit Platform"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    DEFAULT_ENGINE: str = os.getenv("DEFAULT_ENGINE", "gemini")
    PRIMARY_OCR_MODEL: str = os.getenv("PRIMARY_OCR_MODEL", "gemini-3.8-flash")
    SECONDARY_OCR_MODEL: str = os.getenv("SECONDARY_OCR_MODEL", "gemini-3.1-flash-lite")
    UNCLEAR_TOKEN_THRESHOLD: int = int(os.getenv("UNCLEAR_TOKEN_THRESHOLD", "1"))
    MIN_LEGIBILITY_SCORE: float = float(os.getenv("MIN_LEGIBILITY_SCORE", "0.72"))
    UPLOAD_DIR: Path = UPLOAD_DIR
    PROCESSED_DIR: Path = PROCESSED_DIR
    SAMPLE_EVAL_DIR: Path = SAMPLE_EVAL_DIR


settings = Settings()
