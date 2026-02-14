"""MinIO object storage service — S3-compatible file storage."""

import io
from typing import Optional
from urllib.parse import urlparse, urlunparse

import boto3
from botocore.client import Config
from botocore.exceptions import ClientError

from core.config import settings


class StorageService:
    """Handles file uploads/downloads to MinIO."""

    def __init__(self):
        protocol = "https" if settings.MINIO_USE_SSL else "http"

        # Internal client — used for upload / download / delete (container network)
        self.client = boto3.client(
            "s3",
            endpoint_url=f"{protocol}://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )

        # Public client — used only for presigned URLs so the signature
        # matches the hostname the browser will actually hit via Nginx.
        public_endpoint = settings.MINIO_PUBLIC_ENDPOINT or settings.MINIO_ENDPOINT
        self.public_client = boto3.client(
            "s3",
            endpoint_url=f"{protocol}://{public_endpoint}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="us-east-1",
        )

        self.bucket = settings.MINIO_BUCKET
        self._bucket_ready = False
        self._ensure_bucket()

    def _ensure_bucket(self):
        """Create the bucket if it doesn't exist."""
        if self._bucket_ready:
            return

        try:
            self.client.head_bucket(Bucket=self.bucket)
            self._bucket_ready = True
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)
            self._bucket_ready = True
        except Exception:
            # Defer hard failure until an actual storage operation is attempted.
            self._bucket_ready = False

    def upload_file(self, file_bytes: bytes, key: str, content_type: str) -> str:
        """Upload file bytes to MinIO and return the object key."""
        self._ensure_bucket()
        self.client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=io.BytesIO(file_bytes),
            ContentLength=len(file_bytes),
            ContentType=content_type,
        )
        return key

    def get_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        """Generate a presigned URL for downloading a file.

        Uses the public client so the signature is computed against the
        browser-accessible hostname. The URL path is rewritten to include
        /storage/ so it routes through Nginx's reverse proxy to MinIO.
        """
        self._ensure_bucket()
        url = self.public_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )
        # Rewrite URL to route through Nginx /storage/ proxy
        # e.g. http://localhost/kagaz-files/... → http://localhost/storage/kagaz-files/...
        parsed = urlparse(url)
        rewritten = parsed._replace(path=f"/storage{parsed.path}")
        return urlunparse(rewritten)

    def download_file(self, key: str) -> bytes:
        """Download a file from MinIO and return its bytes."""
        self._ensure_bucket()
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def delete_file(self, key: str) -> None:
        """Delete a file from MinIO."""
        self._ensure_bucket()
        self.client.delete_object(Bucket=self.bucket, Key=key)

    def file_exists(self, key: str) -> bool:
        """Check if a file exists in MinIO."""
        self._ensure_bucket()
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except ClientError:
            return False


# Singleton instance
storage_service = StorageService()
