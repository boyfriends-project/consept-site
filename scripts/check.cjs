const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const cp=require('node:child_process');
const root=path.resolve(__dirname,'..');const pages=['index.html','coaching/index.html','coaching/monitor/index.html','privacy/index.html','legal/index.html'];
const titles=new Set();let links=0;
for(const name of pages){const html=fs.readFileSync(path.join(root,name),'utf8');
  assert.equal((html.match(/<h1\b/g)||[]).length,1,name+' must have one h1');
  const title=html.match(/<title>(.*?)<\/title>/)[1];assert(!titles.has(title));titles.add(title);
  assert(html.includes('name="description"'));assert(html.includes('noindex,nofollow'));assert(html.includes("form-action 'none'"));
  assert(!html.includes('consept.base.ec'));assert(!/<form\b/.test(html),'Local mock form removed');
  for(const match of html.matchAll(/<a\b[^>]*href="(https:[^"]+)"[^>]*>/g)){
    assert(['https://forms.gle/WQZrT6XwHXSGYqwr8','https://forms.gle/KgDbkkdRvenRpZK9A','https://forms.gle/M7mrS1HMvG1F671S7','https://policies.google.com/privacy?hl=ja','https://consept.jp/'].includes(match[1]));
    assert(match[0].includes('target="_blank"')&&match[0].includes('rel="noopener noreferrer"'));
  }
  assert(!/(?:src|action)="https?:/.test(html),'No embedded external resources');
  for(const match of html.matchAll(/(?:href|src)="(\/[^"#]*)(#[^"]*)?"/g)){
    let file=match[1];if(file.endsWith('/'))file+='index.html';assert(fs.existsSync(path.join(root,file)),name+' -> '+file);links++;
    if(match[2])assert(fs.readFileSync(path.join(root,file),'utf8').includes(`id="${match[2].slice(1)}"`),'Missing fragment '+match[2]);
  }
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert(html.includes(`id="${match[1]}"`),'Missing local fragment');
  for(const match of html.matchAll(/<img\b[^>]+>/g))assert(/alt="[^"]*"/.test(match[0]));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(new Set(ids).size,ids.length,'Duplicate ids');
}
const original=cp.execFileSync('git',['show','origin/main:index.html'],{cwd:root});
const normalized=buffer=>buffer.toString('utf8').replace(/\r\n/g,'\n');
assert(normalized(fs.readFileSync(path.join(root,'archive/concept-design.html')))===normalized(original),'Original service content must be preserved (Git checkout line endings normalized)');
assert(normalized(fs.readFileSync(path.join(root,'CNAME')))===normalized(cp.execFileSync('git',['show','origin/main:CNAME'],{cwd:root})));
assert(cp.execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim().startsWith('codex/'));
assert(!/fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie/.test(fs.readFileSync(path.join(root,'assets/site.js'),'utf8')));
console.log(`PASS: ${pages.length} pages, unique SEO titles/h1, ${links} resource/navigation links, anchors, alt text, no external endpoints, preserved archive and CNAME, isolated branch.`);
