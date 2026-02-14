# --- Backend (FastAPI + Python) ---
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system deps for psycopg2, faiss-cpu
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# Create FAISS index directory
RUN mkdir -p /app/faiss_indices

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
