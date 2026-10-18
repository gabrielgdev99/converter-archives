import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { listActions } from '../src/core/actions.js';
import { convert } from '../src/core/convert.js';
import { ConvertError } from '../src/core/errors.js';
import { friendlyFfmpegError } from '../src/core/ffmpeg.js';
import { officeMissingMessage } from '../src/core/office.js';
import { outputPath } from '../src/core/output.js';
import { lastOutTime, parseProbeText, probe } from '../src/core/probe.js';
import { filesFromArgv, registrySpec } from '../src/core/registry.js';
import { formatName, magic, makeJpg, makeMp4, makePng, makeWav, tmpDir } from './helpers.js';
import { execFileSync } from 'node:child_process';

function ffmpegFat(file) {
  execFileSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=1',
    '-c:v', 'libx264', '-b:v', '4M', '-pix_fmt', 'yuv420p',
    file,
  ], { stdio: 'pipe' });
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('nome de saida fica ao lado e nao sobrescreve', () => {
  const dir = tmpDir();
  const input = path.join(dir, 'foto.png');
  fs.writeFileSync(input, 'origem');
  const first = outputPath(input, 'jpg', 'vireun');
  assert.equal(path.dirname(first), dir);
  assert.equal(path.basename(first), 'foto-vireun.jpg');
  fs.writeFileSync(first, 'ocupado');
  const second = outputPath(input, 'jpg', 'vireun');
  assert.equal(path.basename(second), 'foto-vireun-2.jpg');
  assert.equal(fs.readFileSync(input, 'utf8'), 'origem');
});

test('parser de progresso e duracao do ffmpeg', () => {
  const text = 'out_time=00:00:01.50\nout_time=00:00:03.25\n';
  assert.equal(lastOutTime(text), 3.25);
  const meta = parseProbeText('Duration: 00:01:02.50, start\nVideo: h264, yuv420p, 320x240\nAudio: aac');
  assert.equal(meta.duration, 62.5);
  assert.equal(meta.width, 320);
  assert.equal(meta.height, 240);
  assert.equal(meta.hasAudio, true);
  assert.equal(meta.hasVideo, true);
  assert.match(friendlyFfmpegError('unknown encoder libfoo'), /não está disponível/);
});

test('menu radial de imagem, video, audio, pdf e documento', () => {
  const png = listActions(['/tmp/foto.png']);
  const ids = png.actions.map((item) => item.id);
  assert.equal(png.ok, true);
  assert.equal(png.summary, 'Imagem');
  assert.ok(ids.includes('to-jpg'));
  assert.ok(ids.includes('to-webp'));
  assert.ok(ids.includes('to-avif'));
  assert.ok(ids.includes('to-gif'));
  assert.ok(ids.includes('to-ico'));
  assert.ok(ids.includes('to-pdf'));
  assert.ok(ids.includes('crop'));
  assert.ok(ids.includes('compress'));
  assert.ok(!ids.includes('to-png'));
  assert.ok(!ids.includes('to-mp3'));

  const video = listActions(['/tmp/clipe.mp4']);
  const videoIds = video.actions.map((item) => item.id);
  assert.ok(videoIds.includes('to-webm'));
  assert.ok(videoIds.includes('to-gif'));
  assert.ok(videoIds.includes('trim'));
  assert.ok(!videoIds.includes('to-mp4'));
  const audio = video.actions.find((item) => item.id === 'extract');
  assert.deepEqual(audio.children.map((item) => item.id), ['to-mp3', 'to-wav', 'to-aac', 'to-ogg', 'to-flac']);

  const two = listActions(['/tmp/a.pdf', '/tmp/b.pdf']);
  assert.ok(two.actions.some((item) => item.id === 'merge'));
  assert.equal(two.title, '2 PDFs');

  const mixed = listActions(['/tmp/a.png', '/tmp/b.mp3']);
  assert.equal(mixed.ok, false);
  assert.match(mixed.description, /mesmo tipo/);

  const office = listActions(['/tmp/planilha.xlsx'], { libreOffice: false });
  const pdf = office.actions[0];
  assert.equal(pdf.enabled, false);
  assert.match(pdf.reason, /LibreOffice/);
  const ready = listActions(['/tmp/nota.docx'], { libreOffice: true });
  assert.equal(ready.actions[0].enabled, true);
});

test('atalho do menu do Explorer e leitura de argumentos', () => {
  const spec = registrySpec('C:\\Apps\\Vireun Converter.exe');
  assert.equal(spec.name, 'Converter com Vireun');
  assert.equal(spec.command, '"C:\\Apps\\Vireun Converter.exe" --convert "%1"');
  const files = filesFromArgv(['app.exe', '--convert', 'C:\\a.png', 'C:\\b.png'], (file) => file.endsWith('.png'));
  assert.deepEqual(files, ['C:\\a.png', 'C:\\b.png']);
});

test('png para jpg, webp, gif, ico, avif e svg para png', async () => {
  const dir = tmpDir();
  const png = makePng(dir);
  const before = fs.statSync(png).size;
  const jpg = (await convert('to-jpg', [png])).outputs[0];
  const webp = (await convert('to-webp', [makeJpg(dir, 'origem.jpg')])).outputs[0];
  const gif = (await convert('to-gif', [png])).outputs[0];
  const ico = (await convert('to-ico', [png])).outputs[0];
  const avif = (await convert('to-avif', [png])).outputs[0];
  const svg = path.join(dir, 'marca.svg');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#e08a3c"/></svg>');
  const svgPng = (await convert('to-png', [svg])).outputs[0];
  assert.equal(magic(jpg).jpg, true);
  assert.equal(magic(webp).webp, true);
  assert.equal(magic(gif).gif, true);
  assert.equal(magic(ico).ico, true);
  assert.ok(fs.statSync(avif).size > 20);
  assert.equal(fs.readFileSync(avif).subarray(4, 12).toString('ascii').includes('avif'), true);
  assert.equal(magic(svgPng).png, true);
  assert.equal(fs.statSync(png).size, before);
  assert.equal(path.dirname(jpg), dir);
  assert.match(path.basename(jpg), /^foto-vireun\.jpg$/);
});

test('imagem para pdf, juncao, paginas e compressao', async () => {
  const dir = tmpDir();
  const a = makePng(dir, 'a.png', '80x60', '0x2244aa');
  const b = makePng(dir, 'b.png', '70x70', '0x118855');
  const pdf = (await convert('to-pdf', [a, b])).outputs[0];
  assert.equal(magic(pdf).pdf, true);
  const { PDFDocument } = await import('pdf-lib');
  const mergedCount = (await PDFDocument.load(fs.readFileSync(pdf))).getPageCount();
  assert.equal(mergedCount, 2);
  const one = (await convert('to-pdf', [a])).outputs[0];
  const pages = (await convert('to-png', [one])).outputs;
  assert.equal(pages.length, 1);
  assert.equal(magic(pages[0]).png, true);
  const second = (await convert('to-pdf', [b])).outputs[0];
  const joined = (await convert('merge', [one, second])).outputs[0];
  assert.equal((await PDFDocument.load(fs.readFileSync(joined))).getPageCount(), 2);
  const heavy = makeJpg(dir, 'pesado.jpg');
  const compressed = (await convert('compress', [heavy], { level: 'forte' })).outputs[0];
  assert.equal(magic(compressed).jpg, true);
  assert.ok(fs.statSync(compressed).size < fs.statSync(heavy).size);
  const heavyPdf = (await convert('to-pdf', [heavy])).outputs[0];
  const pdfCompressed = (await convert('compress', [heavyPdf], { level: 'forte' })).outputs[0];
  assert.equal(magic(pdfCompressed).pdf, true);
  assert.ok(fs.statSync(pdfCompressed).size < fs.statSync(heavyPdf).size);
});

test('recortar muda o tamanho da imagem', async () => {
  const dir = tmpDir();
  const png = makePng(dir, 'larga.png', '100x80');
  const out = (await convert('crop', [png], { crop: { x: 10, y: 5, width: 40, height: 30 } })).outputs[0];
  const meta = probe(out);
  assert.equal(meta.width, 40);
  assert.equal(meta.height, 30);
  assert.equal(magic(out).png, true);
});

test('audio: wav, mp3, ogg, flac, aac, aparar e juntar', async () => {
  const dir = tmpDir();
  const wav = makeWav(dir, 'tom.wav', 1.2);
  const mp3 = (await convert('to-mp3', [wav])).outputs[0];
  const ogg = (await convert('to-ogg', [mp3])).outputs[0];
  const flac = (await convert('to-flac', [wav])).outputs[0];
  const aac = (await convert('to-aac', [wav])).outputs[0];
  assert.equal(magic(mp3).mp3, true);
  assert.equal(magic(ogg).ogg, true);
  assert.equal(magic(flac).flac, true);
  assert.equal(magic(aac).aac, true);
  const trimmed = (await convert('trim', [wav], { trim: { start: 0.2, end: 0.7 } })).outputs[0];
  const duration = probe(trimmed).duration;
  assert.ok(duration > 0.35 && duration < 0.9, `duracao ${duration}`);
  const other = makeWav(dir, 'outro.wav', 0.6);
  const joined = (await convert('merge', [wav, other])).outputs[0];
  assert.ok(probe(joined).duration > 1.5);
});

test('video: webm, mkv, mov, gif, extrair mp3, comprimir e juntar', async () => {
  const dir = tmpDir();
  const mp4 = makeMp4(dir, 'clipe.mp4', 0.4);
  const webm = (await convert('to-webm', [mp4])).outputs[0];
  const mkv = (await convert('to-mkv', [mp4])).outputs[0];
  const mov = (await convert('to-mov', [mp4])).outputs[0];
  const gif = (await convert('to-gif', [mp4])).outputs[0];
  const audio = (await convert('to-mp3', [mp4])).outputs[0];
  assert.equal(magic(webm).ebml, true);
  assert.match(formatName(webm), /webm/);
  assert.equal(magic(mkv).ebml, true);
  assert.match(formatName(mkv), /matroska/);
  assert.equal(magic(mov).ftyp, true);
  assert.equal(magic(gif).gif, true);
  assert.equal(magic(audio).mp3, true);
  assert.ok(probe(audio).duration > 0.2);
  const fat = path.join(dir, 'gordo.mp4');
  ffmpegFat(fat);
  const smaller = (await convert('compress', [fat], { level: 'forte' })).outputs[0];
  assert.ok(fs.statSync(smaller).size < fs.statSync(fat).size);
  const second = makeMp4(dir, 'extra.mp4', 0.4);
  const joined = (await convert('merge', [mp4, second])).outputs[0];
  assert.ok(probe(joined).duration > 0.6);
});

test('heic vira jpg sem ffmpeg', async () => {
  const dir = tmpDir();
  const src = path.join(dir, 'amostra.heic');
  fs.copyFileSync(path.join(root, 'tests/fixtures/amostra.heic'), src);
  const jpg = (await convert('to-jpg', [src])).outputs[0];
  assert.equal(magic(jpg).jpg, true);
  assert.ok(fs.statSync(jpg).size > 1000);
});

test('documento office sem LibreOffice explica o motivo', async () => {
  const dir = tmpDir();
  const docx = path.join(dir, 'relatorio.docx');
  fs.writeFileSync(docx, 'nao e um docx de verdade');
  await assert.rejects(
    () => convert('to-pdf', [docx], { soffice: null }),
    (err) => err instanceof ConvertError && err.code === 'LIBREOFFICE_MISSING' && err.message === officeMissingMessage(),
  );
});

test('textos da interface nao usam travessao', () => {
  const banned = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'release' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|cjs|html|css|md|txt|nsi|nsh)$/.test(entry.name)) files.push(full);
    }
  };
  walk(path.join(root, 'src'));
  const readme = path.join(root, 'README.md');
  if (fs.existsSync(readme)) files.push(readme);
  const installer = path.join(root, 'build', 'installer.nsi');
  if (fs.existsSync(installer)) files.push(installer);
  const hits = [];
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of banned) {
      if (text.includes(token)) hits.push(`${path.relative(root, file)} contem ${JSON.stringify(token)}`);
    }
  }
  assert.deepEqual(hits, []);
});
