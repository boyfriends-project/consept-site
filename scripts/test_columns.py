"""Offline integration tests. --preview creates a separate local-only sample release."""
import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from PIL import Image
from column_images import MEDIA, Images, digest
from columns import ROOT, build, fetch_articles, generate, validate

URL = "https://images.microcms-assets.io/assets/test/forest.jpg"
ROW = {"id":"sample", "slug":"sample-column","title":"森を歩く時間（表示見本）",
       "publishedAt":"2026-01-01T00:00:00Z","updatedAt":"2026-01-02T00:00:00Z",
       "category":["心と意識のコラム"],"excerpt":"コラムページのローカル表示見本です。",
       "body":'<h2>日々の気づき</h2><p>木漏れ日の中で、少し立ち止まる時間。</p><figure><img alt="木漏れ日" src="'+URL+'"></figure>',
       "eyecatch":{"url":URL},"seoTitle":"見本のタイトル","seoDescription":"見本の説明文"}


class MockMedia:
    def __init__(self):
        self.raw = (ROOT/"assets/forest.webp").read_bytes()
        self.tag = '"v1"'
        self.origin_gets = 0
        self.published = {}
    def __call__(self,url,method="GET",headers=None,limit=None):
        if url == URL:
            if method == "HEAD":
                return {"ETag":self.tag},b""
            self.origin_gets += 1
            return {"ETag":self.tag},self.raw
        return {},self.published[url]


class Integration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.cache = Path(self.tmp.name)/"cache"
        self.mock = MockMedia()
        self.template = Path(self.tmp.name)/"base"
        subprocess.run(["node","scripts/package-pages.cjs"],cwd=ROOT,
                       env={**os.environ,"COLUMN_STAGE":str(self.template)},check=True,stdout=subprocess.DEVNULL)

    def run_build(self,rows,previous=None):
        stage = Path(tempfile.mkdtemp(dir=self.tmp.name))
        shutil.copytree(self.template,stage,dirs_exist_ok=True)
        images = Images(stage,self.cache,previous or {},self.mock)
        generate(stage,rows,images)
        validate(stage)
        lesson = stage/"lessons/mental-management/index.html"
        self.assertTrue(lesson.is_file())
        self.assertIn('content="noindex,follow"', lesson.read_text(encoding="utf-8"))
        self.assertNotIn("/lessons/", (stage/"sitemap.xml").read_text())
        self.assertTrue((stage/"anxiety-check/index.html").is_file())
        complete = stage/"subscription-complete/index.html"
        self.assertTrue(complete.is_file())
        self.assertIn('content="noindex,follow"', complete.read_text(encoding="utf-8"))
        self.assertNotIn("/subscription-complete/", (stage/"sitemap.xml").read_text())
        self.assertEqual((stage/"downloads/consept_anxiety_checklist.pdf").read_bytes(), (ROOT/"downloads/consept_anxiety_checklist.pdf").read_bytes())
        return stage,images.entries

    def test_lifecycle(self):
        stage, manifest = self.run_build([ROW])
        entry = next(iter(manifest.values()))
        photo = MEDIA+entry["sha256"]+".webp"
        self.mock.published["https://consept.jp"+photo] = (stage/photo.lstrip("/")).read_bytes()
        self.assertEqual(self.mock.origin_gets,1)
        article = (stage/"column/sample-column/index.html").read_text(encoding="utf-8")
        for value in ["見本のタイトル","見本の説明文","木漏れ日の中で","BlogPosting","rel=\"canonical\"",photo]:
            self.assertIn(value,article)
        self.assertIn("sample-column",(stage/"column/category/mind/index.html").read_text(encoding="utf-8"))
        self.assertNotIn("sample-column",(stage/"column/category/essay/index.html").read_text(encoding="utf-8"))
        self.run_build([{**ROW,"title":"更新"}],manifest)
        self.assertEqual(self.mock.origin_gets,1)
        shutil.rmtree(self.cache)
        self.run_build([ROW],manifest)
        self.assertEqual(self.mock.origin_gets,1)
        self.mock.tag = '"v2"'
        self.mock.raw = (ROOT/"assets/sky.webp").read_bytes()
        _, changed = self.run_build([ROW],manifest)
        self.assertNotEqual(next(iter(changed.values()))["sha256"],entry["sha256"])
        self.assertEqual(self.mock.origin_gets,2)
        empty, fresh = self.run_build([],changed)
        self.assertEqual(fresh,{})
        self.assertFalse((empty/"column/sample-column").exists())
        self.assertNotIn("sample-column",(empty/"sitemap.xml").read_text())
        self.assertFalse((empty/photo.lstrip("/")).exists())

    def test_failure_paths(self):
        _, manifest = self.run_build([ROW])
        entry = next(iter(manifest.values()))
        file = self.cache/(entry["sha256"]+".webp")
        file.write_bytes(b"corrupt")
        with self.assertRaisesRegex(ValueError,"checksum"):
            self.run_build([ROW],manifest)
        file.unlink()
        with self.assertRaises(KeyError):
            self.run_build([ROW],manifest)
        self.mock.published["https://consept.jp"+MEDIA+file.name]=b"wrong"
        with self.assertRaisesRegex(ValueError,"checksum"):
            self.run_build([ROW],manifest)
        self.mock.raw=b"not an image"
        with self.assertRaises(OSError):
            self.run_build([ROW])
        with patch("column_images.MAX_NEW_IMAGES",0),self.assertRaisesRegex(ValueError,"guard"):
            self.run_build([ROW])

    def test_lesson_indexing_policy(self):
        stage, _ = self.run_build([])
        lesson = stage/"lessons/mental-management/index.html"
        original = lesson.read_text(encoding="utf-8")
        lesson.write_text(original.replace("noindex,follow", "index,follow"), encoding="utf-8")
        with self.assertRaisesRegex(ValueError,"indexing policy"):
            validate(stage)

    def test_invalid_articles(self):
        with self.assertRaisesRegex(ValueError,"slug"):
            self.run_build([ROW,ROW])
        with self.assertRaisesRegex(ValueError,"origin"):
            self.run_build([{**ROW,"eyecatch":{"url":"https://example.org/invalid.png"}}])
        with self.assertRaisesRegex(ValueError,"Incomplete"):
            fetch_articles("TEST",lambda *a,**kw:({},b'{"totalCount":2,"contents":[]}'))
        with self.assertRaisesRegex(ValueError,"Unsupported"):
            self.run_build([{**ROW,"body":"<script>alert(1)</script>"}])


if __name__ == "__main__":
    if "--preview" in sys.argv:
        with tempfile.TemporaryDirectory() as tmp:
            stage=build([ROW],{},MockMedia(),Path(tmp))
            print(stage)
    else:
        unittest.main()

