"""Tests for storage service."""

from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from services.storage_service import StorageService


class TestStorageService:
    """Tests for MinIO storage service."""

    @patch("boto3.client")
    def test_init_creates_bucket(self, mock_boto):
        """Test that initialization creates the bucket if needed."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "NoSuchBucket"}},
            "HeadBucket",
        )

        with patch.dict("os.environ", {"MINIO_ENDPOINT": "localhost:9000"}):
            service = StorageService()

        mock_client.create_bucket.assert_called_once()

    @patch("boto3.client")
    def test_upload_file(self, mock_boto):
        """Test uploading a file."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True

        service = StorageService()
        key = service.upload_file(b"test data", "test/key.pdf", "application/pdf")

        assert key == "test/key.pdf"
        mock_client.put_object.assert_called_once()

    @patch("boto3.client")
    def test_get_presigned_url(self, mock_boto):
        """Test generating a presigned URL."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True
        mock_client.generate_presigned_url.return_value = "https://minio/presigned"
        
        service = StorageService()
        url = service.get_presigned_url("test/key.pdf")

        assert url == "https://minio/storage/presigned"

    @patch("boto3.client")
    def test_download_file(self, mock_boto):
        """Test downloading a file."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True
        mock_body = MagicMock()
        mock_body.read.return_value = b"file content"
        mock_client.get_object.return_value = {"Body": mock_body}

        service = StorageService()
        data = service.download_file("test/key.pdf")

        assert data == b"file content"

    @patch("boto3.client")
    def test_delete_file(self, mock_boto):
        """Test deleting a file."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True

        service = StorageService()
        service.delete_file("test/key.pdf")

        mock_client.delete_object.assert_called_once()

    @patch("boto3.client")
    def test_file_exists_true(self, mock_boto):
        """Test file_exists returns True when file exists."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True
        mock_client.head_object.return_value = {}

        service = StorageService()
        assert service.file_exists("test/key.pdf") is True

    @patch("boto3.client")
    def test_file_exists_false(self, mock_boto):
        """Test file_exists returns False when file doesn't exist."""
        from botocore.exceptions import ClientError

        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True
        mock_client.head_object.side_effect = ClientError(
            {"Error": {"Code": "404"}}, "HeadObject"
        )

        service = StorageService()
        assert service.file_exists("nonexistent.pdf") is False

    @patch("boto3.client")
    def test_presigned_url_custom_expiry(self, mock_boto):
        """Test presigned URL with custom expiry time."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.generate_presigned_url.return_value = "https://minio/presigned"
        
        service = StorageService()
        service.get_presigned_url("test/key.pdf", expires_in=7200)

        call_kwargs = mock_client.generate_presigned_url.call_args
        assert call_kwargs.kwargs.get("ExpiresIn", call_kwargs[1].get("ExpiresIn")) == 7200

    @patch("boto3.client")
    def test_get_presigned_url_respects_public_base_url(self, mock_boto):
        """Presigned URL should use provided external scheme and host."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True
        mock_client.generate_presigned_url.return_value = (
            "http://minio:9000/kagaz-files/test/key.pdf?X-Amz-Signature=abc"
        )

        service = StorageService()
        url = service.get_presigned_url(
            "test/key.pdf",
            public_base_url="https://app.dheerajjoshi.me",
        )
        
        assert url.startswith("https://app.dheerajjoshi.me/storage/kagaz-files/test/key.pdf")
        assert "X-Amz-Signature=abc" in url

    @patch("boto3.client")
    def test_get_presigned_url_public_base_url_without_scheme_defaults_https(self, mock_boto):
        """Public base URL without scheme should default to HTTPS."""
        mock_client = MagicMock()
        mock_boto.return_value = mock_client
        mock_client.head_bucket.return_value = True
        mock_client.generate_presigned_url.return_value = (
            "http://minio:9000/kagaz-files/test/key.pdf?X-Amz-Signature=abc"
        )

        service = StorageService()
        url = service.get_presigned_url(
            "test/key.pdf",
            public_base_url="app.dheerajjoshi.me",
        )

        assert url.startswith("https://app.dheerajjoshi.me/storage/kagaz-files/test/key.pdf")
