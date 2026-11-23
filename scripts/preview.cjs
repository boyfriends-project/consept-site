// Local, read-only, allowlisted preview server. No form endpoint or data logging.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');
const phone=process.argv.includes('--phone');
const root=path.resolve(__dirname,'..');const port=Number(process.env.PORT||(phone?3001:3000));
let host='127.0.0.1';
if(phone){
  const candidates=Object.entries(require('node:os').networkInterfaces())
    .sort(([a],[b])=>Number(/virtual|vethernet|vpn|wsl/i.test(a))-Number(/virtual|vethernet|vpn|wsl/i.test(b)))
    .flatMap(([,entries])=>entries||[]).filter(i=>!i.internal&&i.family==='IPv4'&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(i.address));
  if(!candidates.length){console.error('家庭内LANのアドレスが見つかりません。PCの接続を確認してください。');process.exit(1);}
  host=candidates[0].address;
}
const pages=new Set(['/subscription-complete/','/subscription-complete/index.html','/lessons/mental-management/','/lessons/mental-management/index.html','/anxiety-check/','/anxiety-check/index.html','/','/index.html','/coaching/','/coaching/index.html','/coaching/monitor/','/coaching/monitor/index.html','/privacy/','/privacy/index.html','/legal/','/legal/index.html']);
const types={'.pdf':'application/pdf','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'none'; form-action 'none'; frame-src https://www.youtube-nocookie.com; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end('Preview only. Submission disabled.');return;}
  try{
    const url=new URL(req.url,'http://localhost');let name=decodeURIComponent(url.pathname);
    if(['/subscription-complete','/lessons/mental-management','/anxiety-check','/coaching','/coaching/monitor','/privacy','/legal'].includes(name)){res.writeHead(308,{Location:name+'/'});res.end();return;}
    if(name !== '/downloads/consept_anxiety_checklist.pdf'&&!pages.has(name)&&!/^\/assets\/[a-z0-9-]+\.(css|js|svg|webp)$/.test(name)){res.writeHead(404);res.end('Not found');return;}
    if(name.endsWith('/'))name+='index.html';const file=path.join(root,name);
    const stat=fs.statSync(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Set PORT to another port.`:error.message);process.exitCode=1;});
server.listen(port,host,()=>console.log(phone?`スマホで開くURL: http://${host}:${port}/  （終了: Ctrl+C）`:`consept local preview: http://localhost:${port} (loopback only; all submissions blocked)`));
