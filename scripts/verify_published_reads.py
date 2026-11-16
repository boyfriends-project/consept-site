"""Read-only checks for the first release and an immutable Pages preview."""
from urllib.error import HTTPError
from unittest.mock import patch

import column_images as media


def verify():
    try:
        media.previous_manifest(media.request, bootstrap=False)
    except HTTPError as exc:
        if exc.code != 404:
            raise
    else:
        raise AssertionError("Expected pre-launch production to have no manifest")
    assert media.previous_manifest(media.request, bootstrap=True) == {}
    print("Production: 404 propagated normally and accepted only during bootstrap")

    preview = "https://7b6fbafb.consept-site.pages.dev"
    with patch.object(media, "SITE", preview):
        images = media.previous_manifest(media.request, bootstrap=False)
        assert images, "The selected preview must contain published images"
        for entry in images.values():
            url = preview + media.MEDIA + entry["sha256"] + ".webp"
            _, data = media.request(url)
            assert media.digest(data) == entry["sha256"], "Published digest mismatch"
            assert media.decode(data).size == (entry["width"], entry["height"])
        print(f"Preview: manifest and {len(images)} image(s) fetched and verified")


if __name__ == "__main__":
    verify()
