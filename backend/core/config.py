"""Application configuration loaded from environment variables."""

import json
from typing import Any, List, Optional, Union

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://kagaz:kagaz@db:5432/kagaz"

    # MinIO / S3
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = "localhost"
    MINIO_PUBLIC_USE_SSL: Optional[bool] = None
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "kagaz-files"
    MINIO_USE_SSL: bool = False

    # Cerebras - Chat / Summarization
    CEREBRAS_API_KEY: str = ""
    CEREBRAS_BASE_URL: str = "https://api.cerebras.ai/v1"
    CEREBRAS_CHAT_MODEL: str = "gpt-oss-120b"
    CEREBRAS_DEEP_MODEL: str = "zai-glm-4.7"
    CEREBRAS_REASONING_EFFORT: str = "low"
    CEREBRAS_CHAT_REASONING_EFFORT: str = "low"
    CEREBRAS_DEEP_REASONING_EFFORT: str = "high"

    # OpenRouter - Chat model provider
    OPENROUTER_API_KEY: str = ""
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    OPENROUTER_HTTP_REFERER: str = ""
    OPENROUTER_APP_TITLE: str = "DocWise"

    # Local embeddings - free document indexing/search
    LOCAL_EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384
    EMBEDDING_VERSION: str = "bge-small-en-v1.5-v1"
    LEGACY_FAISS_DUAL_WRITE: bool = True

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
    STREAM_EVENT_TTL_SECONDS: int = 900

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
    LLM_DAILY_BUDGET_UNITS_PER_USER: int = 30
    LLM_MAX_CONCURRENT_STREAMS_PER_USER: int = 3
    CHAT_DAILY_LIMIT_PER_USER: int = 30
    CHAT_FAST_CREDIT_COST: int = 1
    CHAT_DEEP_CREDIT_COST: int = 3

    # Conversation context and provider resilience
    CHAT_SUMMARY_MESSAGE_THRESHOLD: int = 12
    CHAT_SUMMARY_CONTEXT_PERCENT: int = 25
    CHAT_PROVIDER_CONNECT_TIMEOUT_SECONDS: float = 10.0
    CHAT_PROVIDER_READ_TIMEOUT_SECONDS: float = 120.0
    CHAT_PROVIDER_TOTAL_TIMEOUT_SECONDS: float = 180.0
    CHAT_PROVIDER_MAX_RETRIES: int = 1
    CHAT_CIRCUIT_FAILURE_THRESHOLD: int = 5
    CHAT_CIRCUIT_RESET_SECONDS: int = 30
    CHAT_HEARTBEAT_SECONDS: int = 15
    CHAT_RETRIEVAL_LIMIT: int = 10
    CHAT_RETRIEVAL_CANDIDATES: int = 30

    # Upload limits
    MAX_UPLOAD_SIZE_MB: int = 50
    MAX_FILES_PER_USER_PER_DAY: int = 5

    # Clerk Auth
    CLERK_JWKS_URL: str = ""
    CLERK_ISSUER: str = ""

    # CORS
    CORS_ORIGINS: Union[str, List[str]] = "http://localhost:3000"

    # FAISS
    FAISS_INDEX_PATH: str = "./faiss_indices"

    # Celery
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/1"
    PROCESSING_STALE_AFTER_SECONDS: int = 600

    # Schema lifecycle
    REQUIRED_SCHEMA_REVISION: str = "0001_project_grade_backend"

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
                try:
                    return json.loads(stripped)
                except json.JSONDecodeError:
                    stripped = stripped.strip("[]")
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

    @property
    def cors_origins(self) -> List[str]:
        return self.parse_cors_origins(self.CORS_ORIGINS)


settings = Settings()
