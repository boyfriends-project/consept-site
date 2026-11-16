"""Build-time image validation and content-addressed storage."""
import hashlib
import io
import json
import re
import warnings
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from PIL import Image, ImageOps

SITE = "https://consept.jp"
MANIFEST = "/column/media-index-v1.json"
MEDIA = "/assets/column/"
MAX_FILE = 25 * 1024 * 1024
MAX_SOURCE_BYTES = 96 * 1024 * 1024
MAX_NEW_IMAGES = 100
MAX_PIXELS = 42_000_000


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


def request(url, method="GET", headers=None, limit=MAX_FILE):
    req = Request(url, method=method, headers=headers or {})
    if url.startswith(SITE + "/"):
        # Cloudflare rejects urllib's default user agent on the published site.
        req.add_header("User-Agent", "consept-site/1.0 (+https://consept.jp/)")
    with build_opener(NoRedirect()).open(req, timeout=35) as res:
        if res.status != 200:
            raise ValueError("Unexpected HTTP status")
        if method == "HEAD":
            return res.headers, b""
        size = res.headers.get("Content-Length")
        if size and int(size) > limit:
            raise ValueError("Response exceeds byte limit")
        data = res.read(limit + 1)
        if len(data) > limit or (size and len(data) != int(size)):
            raise ValueError("Incomplete or oversized response")
        return res.headers, data


def previous_manifest(http, bootstrap):
    try:
        _, raw = http(SITE + MANIFEST, headers={"Cache-Control": "no-cache"})
    except HTTPError as exc:
        if exc.code == 404 and bootstrap:
            return {}
        raise
    manifest = json.loads(raw)
    if manifest["version"] != 1 or not isinstance(manifest["images"], dict):
        raise ValueError("Invalid published image manifest")
    return manifest["images"]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def decode(data):
    with warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as image:
            if image.width * image.height > MAX_PIXELS or getattr(image, "n_frames", 1) != 1:
                raise ValueError("Oversized or animated image")
            image.load()
            return ImageOps.exif_transpose(image).copy()


class Images:
    def __init__(self, stage, cache, previous, http=request):
        self.stage, self.cache, self.previous, self.http = stage, cache, previous, http
        self.entries = {}
        self.downloads = self.source_bytes = 0

    def add(self, url):
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != "images.microcms-assets.io" or parsed.fragment:
            raise ValueError("Unsupported image origin or URL")
        key = digest(url.encode())
        if key in self.entries:
            return self.entries[key]
        headers, _ = self.http(url, method="HEAD")
        tag = headers.get("ETag", "")
        strong = bool(re.fullmatch(r'"[^"\r\n]+"', tag))
        old = self.previous.get(key)
        if old and strong and old["etag"] == tag:
            sha = old["sha256"]
            if not re.fullmatch("[0-9a-f]{64}", sha):
                raise ValueError("Invalid image digest")
            path = self.cache / (sha + ".webp")
            if path.is_file():
                data = path.read_bytes()
            else:
                _, data = self.http(SITE + MEDIA + sha + ".webp")
            if digest(data) != sha:
                raise ValueError("Reused image checksum mismatch")
            image = decode(data)
            if image.size != (old["width"], old["height"]):
                raise ValueError("Reused image dimensions mismatch")
        else:
            if self.downloads >= MAX_NEW_IMAGES or self.source_bytes >= MAX_SOURCE_BYTES:
                raise ValueError("Per-build image transfer guard reached")
            remaining = min(MAX_FILE, MAX_SOURCE_BYTES - self.source_bytes)
            response, raw = self.http(url, headers={"If-Match": tag} if strong else {}, limit=remaining)
            if strong and response.get("ETag") != tag:
                raise ValueError("Source image changed during build")
            self.source_bytes += len(raw)
            self.downloads += 1
            image = decode(raw)
            image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
            encoded = io.BytesIO()
            image.save(encoded, format="WEBP", quality=82)
            data = encoded.getvalue()
            sha = digest(data)
        entry = {"sha256": sha, "etag": tag, "width": image.width, "height": image.height}
        for folder in [self.cache, self.stage / MEDIA.strip("/")]:
            folder.mkdir(parents=True, exist_ok=True)
            (folder / (sha + ".webp")).write_bytes(data)
        self.entries[key] = entry
        return entry

    def finish(self):
        path = self.stage / MANIFEST.lstrip("/")
        path.write_text(json.dumps({"version": 1, "images": self.entries}), encoding="utf-8")
        for entry in self.entries.values():
            file = self.stage / MEDIA.strip("/") / (entry["sha256"] + ".webp")
            if digest(file.read_bytes()) != entry["sha256"]:
                raise ValueError("Packaged image checksum mismatch")
        active = {entry["sha256"] for entry in self.entries.values()}
        for file in self.cache.glob("*.webp"):
            if re.fullmatch("[0-9a-f]{64}", file.stem) and file.stem not in active:
                file.unlink()

