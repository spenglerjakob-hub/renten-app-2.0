// Rendert das Werbevideo (index.html) Bild fuer Bild zu einer MP4-Datei.
//
//   node marketing/werbevideo/rendern.mjs                      → werbevideo.mp4 neben dieser Datei (1920 × 1080, 30 Bilder/s)
//   node marketing/werbevideo/rendern.mjs --fps 60 --aus /pfad/film.mp4
//   node marketing/werbevideo/rendern.mjs --bilder 2.5,9,22.6 --ordner /pfad    → Standbilder als PNG, zum Pruefen
//
// Braucht Playwright (im Repo vorhanden) und ffmpeg im Pfad. Die Seite kennt keine Uhr: `zeige(t)` stellt das Bild
// zur Sekunde t her — deshalb ist das Ergebnis bei jedem Lauf dasselbe, gleich wie schnell der Rechner ist.
// Liegt Chromium nicht dort, wo Playwright es sucht: CHROMIUM=/pfad/zu/chromium setzen.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const hier = dirname(fileURLToPath(import.meta.url));
const arg = (name, vorgabe) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : vorgabe; };
const FPS = Number(arg('fps', 30));
const DAUER = 30;
const AUS = arg('aus', join(hier, 'werbevideo.mp4'));
const BILDER = arg('bilder', null);

const pfad = process.env.CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: pfad, args: ['--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => { console.error('Fehler auf der Seite:', e); process.exitCode = 1; });
await page.goto(`${pathToFileURL(join(hier, 'index.html'))}?render`);
await page.evaluate(() => window.bereit);
const bild = async (t) => { await page.evaluate((s) => window.zeige(s), t); return page.screenshot({ type: 'png' }); };

if (BILDER) {
  const ordner = arg('ordner', join(hier, 'standbilder'));
  mkdirSync(ordner, { recursive: true });
  for (const t of BILDER.split(',').map(Number)) writeFileSync(join(ordner, `t-${t.toFixed(2).padStart(5, '0')}.png`), await bild(t));
  console.log(`Standbilder in ${ordner}`);
} else {
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', '-r', String(FPS), AUS], { stdio: ['pipe', 'inherit', 'inherit'] });
  const fertig = new Promise((ok, nein) => ffmpeg.on('close', (code) => (code === 0 ? ok() : nein(new Error(`ffmpeg endet mit ${code}`)))));
  const anzahl = FPS * DAUER;
  for (let i = 0; i < anzahl; i++) {
    if (!ffmpeg.stdin.write(await bild(i / FPS))) await new Promise((weiter) => ffmpeg.stdin.once('drain', weiter));
    if (i % (FPS * 5) === 0) console.log(`${Math.round(i / FPS)} s von ${DAUER} s`);
  }
  ffmpeg.stdin.end();
  await fertig;
  console.log(`Fertig: ${AUS}`);
}
await browser.close();
