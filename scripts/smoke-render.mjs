import { chromium } from 'playwright';
const out = process.env.OUT ?? 'shots'; (await import('fs')).mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--headless=new'] });
const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto('http://localhost:5173/');
await p.waitForSelector('text=Entrar');
await p.screenshot({ path: `${out}/login.png` });
// Arte + vídeo no navegador (sem rede externa)
const r = await p.evaluate(async () => {
  const m = await import('/src/lib/art.ts');
  const brand = { primary: '#FFE600', secondary: '#2D3277', text: '#111111', font: 'Inter', handle: '@meuperfil' };
  const img = document.createElement('canvas'); img.width = 600; img.height = 600; const g = img.getContext('2d'); g.fillStyle = '#e33'; g.beginPath(); g.arc(300,300,250,0,7); g.fill();
  const image = await m.loadImage(img.toDataURL());
  const data = { title: 'Fone Bluetooth com cancelamento de ruído e bateria de longa duração', features: ['Bateria 30 h', 'Cancelamento de ruído', 'Multiponto'], price: 199.9, priceCheckedAt: new Date().toISOString(), showPrice: true, cta: 'Ver detalhes no Mercado Livre', disclosure: 'Publicidade · link de afiliado', image, brand };
  const res = {};
  for (const t of ['square','portrait','story','pin','thumb','share']) {
    const c = document.createElement('canvas'); m.drawArt(c, t, data);
    const blob = await m.canvasToBlob(c, 'image/jpeg'); res[t] = [c.width, c.height, blob.size, c.toDataURL('image/jpeg', 0.7)];
  }
  const v = await m.renderVideo(data, 2);
  res.video = [v.ext, v.blob.size, v.blob.type];
  return res;
});
for (const [k, v] of Object.entries(r)) {
  if (k === 'video') { console.log('video', v); continue; }
  console.log(k, v[0] + 'x' + v[1], v[2] + ' bytes');
  const fs = await import('fs'); fs.writeFileSync(`${out}/art-${k}.jpg`, Buffer.from(v[3].split(',')[1], 'base64'));
}
await p.goto('http://localhost:5173/p/inexistente'); await p.waitForTimeout(1500);
console.log('errors:', errs);
await b.close();
