"""Shared pytest fixtures for all backend tests."""

import asyncio
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Override settings before importing app
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
os.environ["MINIO_ENDPOINT"] = "localhost:9000"
os.environ["MINIO_ACCESS_KEY"] = "test"
os.environ["MINIO_SECRET_KEY"] = "test"
os.environ["AZURE_OPENAI_API_KEY"] = "test-key"
os.environ["AZURE_OPENAI_ENDPOINT"] = "https://test.openai.azure.com/"
os.environ["AZURE_OPENAI_CHAT_DEPLOYMENT"] = "gpt-5.2-chat"
os.environ["AZURE_OPENAI_API_VERSION"] = "2024-12-01-preview"
os.environ["AZURE_OPENAI_EMBEDDING_API_KEY"] = "test-key"
os.environ["AZURE_OPENAI_EMBEDDING_ENDPOINT"] = "https://test.openai.azure.com/"
os.environ["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"] = "text-embedding-3-large"
os.environ["AZURE_OPENAI_EMBEDDING_API_VERSION"] = "2024-12-01-preview"
os.environ["OPENAI_API_KEY"] = "test-key"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"
os.environ["CLERK_JWKS_URL"] = "https://test.clerk.dev/.well-known/jwks.json"
os.environ["CLERK_ISSUER"] = "https://test.clerk.dev"
os.environ["FAISS_INDEX_PATH"] = "./test_faiss_indices"
os.environ["API_KEYS"] = '["test-api-key"]'

from models.database import Base
from core.config import settings
from core.security import get_current_user as _original_get_current_user

settings.API_KEYS = ["test-api-key"]


# Use SQLite for testing
TEST_DB_URL = "sqlite+aiosqlite:///./test.db"
test_engine = create_async_engine(TEST_DB_URL, echo=False)
test_session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


# Mock user for authenticated requests
MOCK_USER = {
    "sub": "user_test123",
    "email": "test@example.com",
    "name": "Test User",
    "image_url": "https://example.com/avatar.png",
}


@pytest.fixture(scope="session")
def event_loop():
    """Create an event loop for the session."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Create tables before each test, drop after."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    # Clean up test db file
    if os.path.exists("./test.db"):
        os.remove("./test.db")


@pytest_asyncio.fixture
async def db_session():
    """Provide a test database session."""
    async with test_session_factory() as session:
        yield session


@pytest.fixture
def mock_auth():
    """Mock the authentication dependency."""
    with patch("core.security.get_current_user", return_value=MOCK_USER) as mock:
        yield mock


@pytest.fixture
def mock_storage():
    """Mock MinIO storage service."""
    mock = MagicMock()
    mock.upload_file = MagicMock(return_value="test/key/file.pdf")
    mock.get_presigned_url = MagicMock(return_value="https://minio.local/test-url")
    mock.download_file = MagicMock(return_value=b"fake-file-bytes")
    mock.delete_file = MagicMock()
    mock.file_exists = MagicMock(return_value=True)
    with patch("services.storage_service.storage_service", mock), \
         patch("routers.files.storage_service", mock), \
         patch("routers.chat.storage_service", mock):
        yield mock


@pytest.fixture
def mock_celery():
    """Mock Celery task dispatch."""
    with patch("tasks.celery_worker.process_pdf") as mock_pdf, \
         patch("tasks.celery_worker.process_media") as mock_media:
        mock_pdf.delay = MagicMock()
        mock_media.delay = MagicMock()
        yield {"pdf": mock_pdf, "media": mock_media}


@pytest.fixture
def mock_embedding_service():
    """Mock the embedding service at the usage sites (routers)."""
    mock = MagicMock()
    mock.embed_texts = MagicMock(return_value=[[0.1] * 768])
    mock.embed_query = MagicMock(return_value=[0.1] * 768)
    mock.ingest_document = MagicMock()
    mock.search_similar = MagicMock(
        return_value=[
            {"text": "sample text", "score": 0.95, "file_id": "test-id"},
        ]
    )
    with patch("routers.search.embedding_service", mock), \
         patch("routers.chat.embedding_service", mock), \
         patch("services.embedding_service.embedding_service", mock):
        yield mock


@pytest.fixture
def mock_ai_service():
    """Mock the AI service."""
    async def fake_stream(*args, **kwargs):
        yield "This is "
        yield "a test "
        yield "answer."

    mock = MagicMock()
    mock.chat_stream = fake_stream
    mock.chat_no_context = fake_stream
    mock.summarize = AsyncMock(return_value="This is a test summary.")
    mock.summarize_stream = fake_stream
    with patch("services.ai_service.ai_service", mock), \
         patch("routers.chat.ai_service", mock):
        yield mock


@pytest.fixture
def mock_pdf_service():
    """Mock the PDF service."""
    mock = MagicMock()
    mock.extract_and_chunk = MagicMock(
        return_value=["chunk 1", "chunk 2", "chunk 3"]
    )
    mock.extract_full_text = MagicMock(return_value="Full text of the PDF document.")
    with patch("services.pdf_service.pdf_service", mock), \
         patch("routers.chat.pdf_service", mock):
        yield mock


@pytest.fixture
def mock_transcription_service():
    """Mock the transcription service."""
    with patch("services.transcription_service.transcription_service") as mock:
        mock.transcribe = MagicMock(
            return_value={
                "text": "Hello world, this is a test transcription.",
                "segments": [
                    {"start": 0.0, "end": 2.5, "text": "Hello world,"},
                    {"start": 2.5, "end": 5.0, "text": " this is a test transcription."},
                ],
                "duration": 5.0,
            }
        )
        mock.get_chunks_with_timestamps = MagicMock(
            return_value=[
                {"text": "Hello world, this is a test transcription.", "start_time": 0.0, "end_time": 5.0}
            ]
        )
        yield mock


@pytest_asyncio.fixture
async def client():
    """Create an async test client with mocked auth."""
    from main import app
    from models.database import get_db

    async def override_get_db():
        async with test_session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[_original_get_current_user] = lambda: MOCK_USER

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"X-API-Key": "test-api-key"},
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest.fixture
def sample_file_id():
    return str(uuid.uuid4())


@pytest.fixture(autouse=True)
def cleanup_faiss():
    """Clean up test FAISS indices after each test."""
    yield
    import shutil
    if os.path.exists("./test_faiss_indices"):
        shutil.rmtree("./test_faiss_indices")


@pytest_asyncio.fixture(autouse=True)
async def cleanup_runtime_state():
    """Reset cache/rate-limiter state across tests."""
    from core.cache import cache_service
    from core.rate_limit import rate_limiter

    await cache_service.clear()
    await rate_limiter.clear()
    yield
    await cache_service.clear()
    await rate_limiter.clear()
