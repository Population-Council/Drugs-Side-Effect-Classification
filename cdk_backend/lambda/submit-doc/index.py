"""
submit-doc: returns a short-lived presigned S3 POST so the browser can upload a
user-submitted document straight into  s3://<bucket>/submitted_docs/ .

Files land OUTSIDE the Knowledge Base's inclusion prefix (public/), so nothing
uploaded here reaches Tobi's knowledge until someone at i2i reviews it and
moves it into public/.

Request  (POST, JSON):  {"fileName": "report.pdf", "contentType": "application/pdf", "size": 12345}
Response (200, JSON):   {"url": "...", "fields": {...}, "key": "submitted_docs/..."}
"""

import json
import os
import re
import uuid
from datetime import datetime, timezone

import boto3
from botocore.config import Config

BUCKET = os.environ["BUCKET_NAME"]
PREFIX = os.environ.get("UPLOAD_PREFIX", "submitted_docs/")
MAX_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(50 * 1024 * 1024)))
URL_TTL_SECONDS = 300

ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt", "rtf", "odt",
}

s3 = boto3.client(
    "s3",
    region_name=os.environ.get("AWS_REGION", "us-east-1"),
    config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
)


def _resp(status, body):
    # CORS headers are added by the Lambda Function URL config.
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body),
    }


def _safe_name(name: str) -> str:
    base = os.path.basename(name or "").strip()
    base = re.sub(r"[^A-Za-z0-9._ -]", "_", base)
    base = re.sub(r"\s+", "_", base)
    return base[:150] or "document"


def lambda_handler(event, context):
    method = (event.get("requestContext", {}).get("http", {}).get("method") or "").upper()
    if method == "OPTIONS":
        return _resp(200, {})
    if method != "POST":
        return _resp(405, {"error": "Method not allowed"})

    try:
        raw = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            import base64
            raw = base64.b64decode(raw).decode("utf-8")
        payload = json.loads(raw)
    except Exception:
        return _resp(400, {"error": "Invalid JSON body"})

    file_name = _safe_name(payload.get("fileName"))
    ext = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if ext not in ALLOWED_EXTENSIONS:
        return _resp(400, {"error": "Unsupported file type"})

    try:
        size = int(payload.get("size") or 0)
    except (TypeError, ValueError):
        size = 0
    if size <= 0 or size > MAX_BYTES:
        return _resp(400, {"error": f"File must be between 1 byte and {MAX_BYTES // (1024 * 1024)} MB"})

    content_type = str(payload.get("contentType") or "application/octet-stream")[:100]

    now = datetime.now(timezone.utc)
    key = f"{PREFIX}{now:%Y-%m-%d}/{now:%H%M%S}-{uuid.uuid4().hex[:8]}-{file_name}"

    try:
        presigned = s3.generate_presigned_post(
            Bucket=BUCKET,
            Key=key,
            Fields={"Content-Type": content_type},
            Conditions=[
                {"Content-Type": content_type},
                ["content-length-range", 1, MAX_BYTES],
            ],
            ExpiresIn=URL_TTL_SECONDS,
        )
    except Exception as e:
        print(f"presign error: {e}")
        return _resp(500, {"error": "Could not prepare upload"})

    return _resp(200, {"url": presigned["url"], "fields": presigned["fields"], "key": key})
