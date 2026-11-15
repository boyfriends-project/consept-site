"""Generate static column pages from published microCMS articles in a fresh staging folder."""
import argparse
import json
import os
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from html import escape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from column_images import Images, MEDIA, SITE, MANIFEST, previous_manifest, request

ROOT = Path(__file__).resolve().parents[1]
API = "https://consept-column.microcms.io/api/v1/articles"
CATEGORIES = {"心と意識のコラム": "mind", "日々の気づき・エッセイ": "essay"}
NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
ET.register_namespace("", NS)


def fetch_articles(token, http=request):
    items = []
    total = None
    while total is None or len(items) < total:
        query = urlencode({"limit": 100, "offset": len(items), "orders": "id"})
        _, raw = http(API + "?" + query, headers={"X-MICROCMS-API-KEY": token})
        batch = json.loads(raw)
        if total is None:
            total = batch["totalCount"]
        if type(total) is not int or total < 0 or batch["totalCount"] != total:
            raise ValueError("Article count changed during build")
        rows = batch["contents"]
        if not isinstance(rows, list) or len(rows) != min(100, total - len(items)):
            raise ValueError("Incomplete article response")
        items.extend(rows)
    if len({row["id"] for row in items}) != total:
        raise ValueError("Duplicate article ids")
    return items


def media_path(entry):
    return MEDIA + entry["sha256"] + ".webp"


def img(entry, alt):
    return (f'<img src="{media_path(entry)}" alt="{escape(alt)}" width="{entry["width"]}" '
            f'height="{entry["height"]}" loading="lazy">')


class RichText(HTMLParser):
    allowed = set("p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code strong em b i u s del sub sup figure figcaption table thead tbody tr th td a br hr".split())

    def __init__(self, images):
        super().__init__()
        self.images = images
        self.parts = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img":
            self.parts.append(img(self.images.add(attrs["src"]), attrs.get("alt") or ""))
        elif tag == "a":
            href = attrs.get("href") or ""
            if urlsplit(href).scheme not in ("https", "http", "mailto") and not href.startswith(("#", "/")):
                href = ""
            self.parts.append('<a href="' + escape(href) + '">' if href else "<a>")
        elif tag in self.allowed:
            self.parts.append("<" + ("h2" if tag == "h1" else tag) + ">")
        elif tag in ("script", "style", "iframe", "video", "picture", "svg", "object"):
            raise ValueError("Unsupported embedded element: " + tag)

    def handle_endtag(self, tag):
        if tag in self.allowed and tag not in ("br", "hr"):
            self.parts.append("</" + ("h2" if tag == "h1" else tag) + ">")

    def handle_data(self, data):
        self.parts.append(escape(data))


def article_categories(value):
    values = value if isinstance(value, list) else [value]
    names = [v.get("name") if isinstance(v, dict) else v for v in values]
    if not names or not all(n in CATEGORIES for n in names):
        raise ValueError("Unknown or missing category")
    return list(dict.fromkeys(names))


def generate(stage, rows, images):
    home = (stage / "index.html").read_text(encoding="utf-8")
    marker = '<a class="contact-link"'
    header_link = '<a href="/column/">コラム</a>'
    for file in stage.rglob("index.html"):
        source = file.read_text(encoding="utf-8")
        if source.count(marker) != 1:
            raise ValueError("Navigation template changed")
        file.write_text(source.replace(marker, header_link + marker), encoding="utf-8")
    header = home.split("<body>", 1)[1].split('<main id="main">', 1)[0].replace(marker, header_link + marker)
    footer = home.split("</main>", 1)[1]
    urls = []
    def page(route, title, summary, content, card=None, entity=None):
        url = SITE + route
        tags = ['<meta charset="utf-8">','<meta name="viewport" content="width=device-width,initial-scale=1">',
                '<link rel="stylesheet" href="/assets/site.css"><link rel="icon" href="/assets/favicon.svg">',
                '<script defer src="/assets/site.js"></script>', f'<title>{escape(title)}</title>',
                f'<link rel="canonical" href="{url}">', f'<meta name="description" content="{escape(summary)}">']
        image = SITE + (media_path(card) if card else "/assets/share.png")
        for key, value in {"og:title":title, "og:description":summary, "og:url":url, "og:image":image,
                           "og:image:width":str(card["width"] if card else 1200), "og:image:height":str(card["height"] if card else 630),
                           "og:type":"article" if entity else "website","og:locale":"ja_JP",
                           "twitter:card":"summary_large_image","twitter:title":title,
                           "twitter:description":summary,"twitter:image":image}.items():
            attr = "property" if key.startswith("og:") else "name"
            tags.append(f'<meta {attr}="{key}" content="{escape(value)}">')
        if entity:
            entity.update({"@context":"https://schema.org","@type":"BlogPosting","url":url,"image":image})
            tags.append('<script type="application/ld+json">' + json.dumps(entity,ensure_ascii=False).replace("<",r"\u003c") + "</script>")
        file = stage / route.strip("/") / "index.html"
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text('<!doctype html><html lang="ja"><head>'+"".join(tags)+'</head><body>'+header+
                        '<main id="main" class="section narrow column">'+content+'</main>'+footer, encoding="utf-8")
        urls.append(url)

    css = stage / "assets/site.css"
    with css.open("a", encoding="utf-8") as f:
        f.write("\n.column{overflow-wrap:anywhere}.column img{max-width:100%;height:auto}.column figure{margin:2em 0}.column pre,.column table{display:block;overflow-x:auto}.column nav a{display:inline-block;margin:0 1em .6em 0}.column-list{list-style:none;padding:0}.column-list li{padding:1.5em 0;border-top:1px solid var(--line)}.column-list img{max-height:200px;width:auto}.column-list h2{font-size:1.4rem}.column article h1{font-family:var(--serif);font-size:clamp(26px,5vw,40px)}\n")
    nav = '<nav aria-label="コラムのカテゴリー"><a href="/column/">すべて</a>'+ "".join(
        f'<a href="/column/category/{slug}/">{name}</a>' for name,slug in CATEGORIES.items())+"</nav>"
    cards = []
    slugs = set()
    for row in sorted(rows, key=lambda r:r["publishedAt"], reverse=True):
        slug = row["slug"]
        if not re.fullmatch("[a-z0-9]+(?:-[a-z0-9]+)*", slug) or slug == "category" or slug in slugs:
            raise ValueError("Duplicate or invalid slug: " + str(slug))
        slugs.add(slug)
        route = "/column/"+slug+"/"
        title, body = row["title"].strip(), row["body"].strip()
        if not title or not body:
            raise ValueError("Missing title/body: "+slug)
        dates = [row["publishedAt"],row["updatedAt"]]
        for date in dates:
            datetime.fromisoformat(date.replace("Z","+00:00"))
        categories = article_categories(row["category"])
        card = images.add(row["eyecatch"]["url"]) if row.get("eyecatch") else None
        parser = RichText(images)
        parser.feed(body)
        parser.close()
        summary = row.get("excerpt") or title
        photo = img(card,"") if card else ""
        date = escape(dates[0][:10])
        content = (f'{nav}<article><p>{" ／ ".join(categories)}　<time>{date}</time></p><h1>{escape(title)}</h1>'
                   +photo+"".join(parser.parts)+'</article><a href="/column/">コラム一覧へ</a>')
        page(route,row.get("seoTitle") or title+"｜consept",row.get("seoDescription") or summary,content,card,
             {"headline":title,"datePublished":dates[0],"dateModified":dates[1],"description":summary,
              "author":{"@type":"Organization","name":"consept","url":SITE+"/"}})
        cards.append((categories,f'<li><a href="{route}">{photo}<h2>{escape(title)}</h2></a><small>{date}　{" ／ ".join(categories)}</small><p>{escape(summary)}</p></li>'))
    def listing(route, label, entries):
        content = '<ul class="column-list">'+"".join(entries)+"</ul>" if entries else "<p>公開中の記事はありません。</p>"
        page(route,label+"｜consept",label+"の記事一覧です。",f"<h1>{label}</h1>"+nav+content)
    listing("/column/","コラム",[card for _,card in cards])
    for name, slug in CATEGORIES.items():
        listing("/column/category/"+slug+"/",name,[c for cats,c in cards if name in cats])
    sitemap = stage / "sitemap.xml"
    tree = ET.parse(sitemap)
    for url in urls:
        ET.SubElement(ET.SubElement(tree.getroot(),"{"+NS+"}url"),"{"+NS+"}loc").text = url
    tree.write(sitemap,encoding="utf-8",xml_declaration=True)
    images.finish()
    with (stage / "_headers").open("a",encoding="utf-8") as f:
        f.write("\n"+MANIFEST+"\n  Cache-Control: no-store\n")
    if sum(p.is_file() for p in stage.rglob("*")) > 20000:
        raise ValueError("Cloudflare Pages free file limit exceeded")


def build(rows, previous, http=request, cache=None):
    base = ROOT/"artifacts"/"column-builds"
    base.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix="build-",dir=base))
    subprocess.run(["node", "scripts/package-pages.cjs"], cwd=ROOT,env={**os.environ,"COLUMN_STAGE":str(stage)}, check=True)
    images = Images(stage,cache or ROOT/".column-cache",previous,http)
    generate(stage,rows,images)
    validate(stage)
    return stage


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []
        self.meta = {}
        self.canonical = None
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "meta":
            self.meta[attrs.get("property") or attrs.get("name")] = attrs.get("content")
        if tag == "link" and attrs.get("rel") == "canonical":
            self.canonical = attrs.get("href")
        for key in ("src","href"):
            value = attrs.get(key) or ""
            if value.startswith("/") and not value.startswith("//"):
                self.paths.append(urlsplit(value).path)


def validate(stage):
    indexed = set()
    for page in stage.rglob("*.html"):
        parser = References()
        parser.feed(page.read_text(encoding="utf-8"))
        if page.name == "index.html":
            parent = page.parent.relative_to(stage).as_posix()
            url = SITE + ("/" if parent == "." else "/" + parent + "/")
            indexed.add(url)
            if parser.canonical != url or parser.meta.get("og:url") != url:
                raise ValueError("Incorrect canonical or sharing URL: " + url)
            for field in ("description", "og:title", "og:image", "twitter:image"):
                if not parser.meta.get(field):
                    raise ValueError("Missing metadata: " + field)
            for field in ("og:image","twitter:image"):
                image = parser.meta[field]
                if not image.startswith(SITE+"/assets/") or not (stage/image[len(SITE)+1:]).is_file():
                    raise ValueError("Missing sharing image")
        for route in parser.paths:
            target = stage / route.lstrip("/")
            if target.is_dir():
                target /= "index.html"
            if not target.is_file():
                raise ValueError("Missing local link: "+route)
    sitemap = ET.parse(stage/"sitemap.xml")
    locations = [loc.text for loc in sitemap.iter("{"+NS+"}loc")]
    if len(locations) != len(indexed) or set(locations) != indexed:
        raise ValueError("Sitemap and published pages differ")
    for loc in sitemap.iter("{"+NS+"}loc"):
        route = loc.text.removeprefix(SITE)
        if not route.startswith("/") or not (stage/route.strip("/")/"index.html").is_file():
            raise ValueError("Invalid sitemap URL")


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("--bootstrap",action="store_true",help="Allow an initial 404 for the published manifest")
    opts = args.parse_args()
    rows = fetch_articles(os.environ["MICROCMS_API_KEY"])
    stage = build(rows, previous_manifest(request,opts.bootstrap))
    print("Validated:",stage)
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"],"a",encoding="utf-8") as output:
            output.write("directory="+stage.as_posix()+"\n")

