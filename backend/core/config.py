"""Application configuration loaded from environment variables."""

import json
from typing import Any, List

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://kagaz:kagaz@db:5432/kagaz"

    # MinIO / S3
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "localhost"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "kagaz-files"
    MINIO_USE_SSL: bool = False

    # Azure OpenAI - Chat
    AZURE_OPENAI_API_KEY: str = ""
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_CHAT_DEPLOYMENT: str = "gpt-5-mini"
    AZURE_OPENAI_DEEP_DEPLOYMENT: str = "gpt-5.2-chat"
    AZURE_OPENAI_API_VERSION: str = "2024-12-01-preview"

    # Azure OpenAI - Embeddings (can be on a different resource)
    AZURE_OPENAI_EMBEDDING_API_KEY: str = ""
    AZURE_OPENAI_EMBEDDING_ENDPOINT: str = ""
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: str = "text-embedding-3-large"
    AZURE_OPENAI_EMBEDDING_API_VERSION: str = "2024-12-01-preview"

    # Azure OpenAI - Whisper (transcription)
    AZURE_OPENAI_WHISPER_API_KEY: str = ""
    AZURE_OPENAI_WHISPER_ENDPOINT: str = ""
    AZURE_OPENAI_WHISPER_DEPLOYMENT: str = "whisper"
    AZURE_OPENAI_WHISPER_API_VERSION: str = "2024-06-01"

    # Legacy (kept for fallback)
    OPENAI_API_KEY: str = ""

    # Redis
    REDIS_URL: str = "redis://redis:6379/0"

    # Caching
    CACHE_ENABLED: bool = True
    CACHE_TTL_CHAT_SECONDS: int = 1800
    CACHE_TTL_SUMMARY_SECONDS: int = 1800
    CACHE_TTL_SEARCH_SECONDS: int = 600

    # API key auth (machine-to-machine access)
    API_KEYS: List[str] = []

    # Rate limiting (per minute)
    RATE_LIMIT_DEFAULT_PER_MINUTE: int = 120
    RATE_LIMIT_UPLOAD_PER_MINUTE: int = 20
    RATE_LIMIT_CHAT_PER_MINUTE: int = 30
    RATE_LIMIT_SUMMARIZE_PER_MINUTE: int = 10
    RATE_LIMIT_SEARCH_PER_MINUTE: int = 60
    RATE_LIMIT_USERS_PER_MINUTE: int = 60
    RATE_LIMIT_NOTES_PER_MINUTE: int = 120

    # LLM usage guardrails
    LLM_DAILY_BUDGET_UNITS_PER_USER: int = 500
    LLM_MAX_CONCURRENT_STREAMS_PER_USER: int = 3

    # Upload limits
    MAX_UPLOAD_SIZE_MB: int = 50

    # Clerk Auth
    CLERK_JWKS_URL: str = ""
    CLERK_ISSUER: str = ""

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # FAISS
    FAISS_INDEX_PATH: str = "./faiss_indices"

    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"

    class Config:
        env_file = ".env"
        extra = "ignore"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> List[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                return json.loads(stripped)
            return [part.strip() for part in stripped.split(",") if part.strip()]
        return ["http://localhost:3000"]

    @field_validator("API_KEYS", mode="before")
    @classmethod
    def parse_api_keys(cls, value: Any) -> List[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if stripped.startswith("["):
                parsed = json.loads(stripped)
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [part.strip() for part in stripped.split(",") if part.strip()]
        return []


settings = Settings()
