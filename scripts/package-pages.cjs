// Prepare static upload files only. Never deploy or change the local preview.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const out = process.env.COLUMN_STAGE || path.join(root, 'release', 'cloudflare-pages');
const siteOrigin = 'https://consept.jp';
const pages = ['index.html', 'coaching/index.html', 'coaching/monitor/index.html', 'privacy/index.html', 'legal/index.html', 'anxiety-check/index.html'];
const unlisted = new Set(require('../content/unlisted-pages.json'));
pages.push(...unlisted);
const assets = ['favicon.svg', 'forest.webp', 'ruri.webp', 'site.css', 'site.js', 'sky.webp', 'anxiety-check.css', 'anxiety-check.js', 'mental-management.css'];
// After approval, copy the chosen 1200 x 630 PNG to assets/share.png.
const hasShareImage = fs.existsSync(path.join(root, 'assets', 'share.png'));
if (hasShareImage) {
  const png = fs.readFileSync(path.join(root, 'assets', 'share.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
  assets.push('share.png');
}
// Future generated column pages can join the same page list before packaging.
function canonicalUrl(name) {
  return new URL(name.replace(/index\.html$/, ''), siteOrigin).href;
}
function escapeMarkup(value) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
function write(name, data) {
  const dest = path.join(out, name);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, data);
}
for (const name of pages) {
  const original = fs.readFileSync(path.join(root, name), 'utf8');
  const banner = '<div class="preview"><span>LOCAL PREVIEW</span><span>ローカル確認用・リンク先は実際のGoogleフォームです</span></div>';
  const robots = '<meta name="robots" content="noindex,nofollow">';
  assert(original.includes(banner) && original.includes(robots), 'Unexpected preview format: ' + name);
  const canonical = `<link rel="canonical" href="${escapeMarkup(canonicalUrl(name))}">`;
  const url = canonicalUrl(name);
  const tags = [canonical, `<meta property="og:url" content="${url}">`,
    '<meta name="twitter:card" content="summary_large_image">'];
  for (const field of ['title', 'description']) {
    const match = original.match(new RegExp('<meta property="og:' + field + '" content="([^"]*)">'));
    assert(match, 'Missing Open Graph ' + field);
    tags.push(`<meta name="twitter:${field}" content="${match[1]}">`);
  }
  if (hasShareImage) {
    const imageUrl = new URL('/assets/share.png', siteOrigin).href;
    tags.push(`<meta property="og:image" content="${imageUrl}">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta name="twitter:image" content="${imageUrl}">`);
  }
  const organization = { '@type': 'Organization', '@id': siteOrigin + '/#organization', name: 'consept', url: siteOrigin + '/' };
  let entity;
  if (name === 'index.html') entity = organization;
  if (name === 'coaching/index.html') {
    const fee = original.match(/<dt>料金<\/dt><dd>([\d,]+)円<small>（税込）<\/small>/);
    const delivery = original.match(/<h2>セッションの提供方法<\/h2><p>([^<]+)<\/p>/);
    assert(fee && delivery, 'Coaching price or delivery text missing');
    entity = {
      '@type': 'Service', name: 'consept coaching', url,
      serviceType: '3ヶ月個別コーチング',
      description: original.match(/<meta name="description" content="([^"]+)">/)[1] + delivery[1],
      provider: { '@id': organization['@id'], '@type': 'Organization', name: organization.name },
      offers: { '@type': 'Offer', priceCurrency: 'JPY', price: Number(fee[1].replaceAll(',', '')),
        priceSpecification: { '@type': 'PriceSpecification', valueAddedTaxIncluded: true,
          priceCurrency: 'JPY', price: Number(fee[1].replaceAll(',', '')) } }
    };
  }
  if (entity) {
    const json = JSON.stringify({ '@context': 'https://schema.org', ...entity }).replaceAll('<', '\\u003c');
    tags.push(`<script type="application/ld+json">${json}</script>`);
  }
  const html = original.replace(banner, '').replace(robots, '<meta name="robots" content="' + (unlisted.has(name) ? 'noindex,follow' : 'index,follow') + '">' + tags.join('\n'));
  assert(!/LOCAL PREVIEW|localhost/.test(html));
  assert.equal(html.includes('content="noindex,follow"'), unlisted.has(name));
  write(name, html);
}
for (const name of assets) write('assets/' + name, fs.readFileSync(path.join(root, 'assets', name)));
write('404.html', '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>ページが見つかりません｜consept</title><link rel="stylesheet" href="/assets/site.css"></head><body><main class="narrow section"><h1>ページが見つかりません</h1><p>URLをご確認いただくか、トップページへお戻りください。</p><a class="button" href="/">トップページへ戻る</a></main></body></html>\n');
const entries = pages.filter(name => !unlisted.has(name)).map(name => `  <url><loc>${escapeMarkup(canonicalUrl(name))}</loc></url>`);
write('sitemap.xml', [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...entries,
  '</urlset>',
  ''
].join('\n'));
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${siteOrigin}/sitemap.xml\n`);
write('_headers', "/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'\n");
const expected = [...pages, ...assets.map(n => 'assets/' + n), '404.html', 'robots.txt', 'sitemap.xml', '_headers'].sort();
const actual = fs.readdirSync(out, {recursive:true, withFileTypes:true}).filter(e=>e.isFile()).map(e=>path.relative(out,path.join(e.parentPath,e.name)).replaceAll('\\','/')).sort();
assert.deepEqual(actual, expected, 'Unexpected files in upload folder');
for (const name of pages) {
  const html = fs.readFileSync(path.join(out,name),'utf8');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"#]*)(#[^"]*)?"/g)) {
    const target = path.join(out,m[1].endsWith('/') ? m[1]+'index.html' : m[1]);
    assert(fs.existsSync(target), name+' -> '+m[1]);
    if(m[2]) assert(fs.readFileSync(target,'utf8').includes('id="'+m[2].slice(1)+'"'));
  }
}
console.log('Prepared and checked ' + actual.length + ' static files: ' + out);
