import { createRequire } from 'node:module';
import { Module } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { classify } from './actions.js';
import { ConvertError } from './errors.js';
import { runFfmpeg, withTemp } from './ffmpeg.js';
import { decodeHeic } from './heic.js';
import { outputPath } from './output.js';
import { rasterSvg } from './svg.js';

const require = createRequire(import.meta.url);
let pdfjsPromise;
let canvasApi;

function installCanvasShim() {
  if (canvasApi) return canvasApi;
  canvasApi = require('@napi-rs/canvas');
  const original = Module.prototype.require;
  if (!original.__vireunCanvas) {
    const wrapped = function patchedRequire(id) {
      if (id === 'canvas') return canvasApi;
      return original.apply(this, arguments);
    };
    wrapped.__vireunCanvas = true;
    Module.prototype.require = wrapped;
  }
  globalThis.DOMMatrix ||= canvasApi.DOMMatrix;
  globalThis.Path2D ||= canvasApi.Path2D;
  globalThis.ImageData ||= canvasApi.ImageData;
  return canvasApi;
}

async function loadPdfjs() {
  if (!pdfjsPromise) {
    installCanvasShim();
    pdfjsPromise = Promise.resolve(require('pdfjs-dist/legacy/build/pdf.js'));
  }
  return pdfjsPromise;
}

function fontPaths() {
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return {
    standardFontDataUrl: path.join(root, 'standard_fonts') + path.sep,
    cMapUrl: path.join(root, 'cmaps') + path.sep,
  };
}

export async function renderPdfPages(pdfPath, { scale = 2, format = 'png', quality = 0.82, hooks, maxPages = 150 } = {}) {
  const pdfjs = await loadPdfjs();
  const { createCanvas } = installCanvasShim();
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const fonts = fontPaths();
  const doc = await pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
    cMapPacked: true,
    ...fonts,
  }).promise;
  if (doc.numPages > maxPages) {
    const total = doc.numPages;
    await doc.destroy();
    throw new ConvertError(`Este PDF tem ${total} páginas. O limite por vez é ${maxPages}.`);
  }
  const images = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    hooks?.onProgress?.({ ratio: (index - 1) / doc.numPages, label: `Página ${index} de ${doc.numPages}` });
    const page = await doc.getPage(index);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const buffer = format === 'jpeg'
      ? canvas.toBuffer('image/jpeg', Math.round(quality * 100))
      : canvas.toBuffer('image/png');
    images.push({ buffer, width: canvas.width, height: canvas.height });
    page.cleanup();
  }
  await doc.destroy();
  hooks?.onProgress?.({ ratio: 1, label: 'PDF' });
  return images;
}

async function toEmbeddable(file, tmp, index) {
  const info = classify(file);
  if (info.ext === 'jpg') return { kind: 'jpg', buffer: fs.readFileSync(file) };
  if (info.ext === 'png') return { kind: 'png', buffer: fs.readFileSync(file) };
  if (info.ext === 'svg') {
    const dest = path.join(tmp, `${index}.png`);
    await rasterSvg(file, dest);
    return { kind: 'png', buffer: fs.readFileSync(dest) };
  }
  if (info.ext === 'heic') {
    const dest = path.join(tmp, `${index}.jpg`);
    await decodeHeic(file, dest);
    return { kind: 'jpg', buffer: fs.readFileSync(dest) };
  }
  const dest = path.join(tmp, `${index}.jpg`);
  await runFfmpeg(['-i', file, '-frames:v', '1', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuvj420p', '-q:v', '3', dest], {});
  return { kind: 'jpg', buffer: fs.readFileSync(dest) };
}

export async function imagesToPdf(files, outPath, hooks = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  await withTemp(async (tmp) => {
    for (let index = 0; index < files.length; index += 1) {
      hooks.onProgress?.({ ratio: index / files.length, label: 'Gerando PDF' });
      const prepared = await toEmbeddable(files[index], tmp, index);
      const embedded = prepared.kind === 'jpg' ? await doc.embedJpg(prepared.buffer) : await doc.embedPng(prepared.buffer);
      const max = 1440;
      const scale = Math.min(1, max / Math.max(embedded.width, embedded.height));
      const width = Math.max(1, embedded.width * scale);
      const height = Math.max(1, embedded.height * scale);
      const page = doc.addPage([width, height]);
      page.drawImage(embedded, { x: 0, y: 0, width, height });
    }
  });
  fs.writeFileSync(outPath, await doc.save());
  hooks.onProgress?.({ ratio: 1, label: 'Gerando PDF' });
  return [outPath];
}

export async function mergePdfFiles(files, outPath, hooks = {}) {
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  try {
    for (let index = 0; index < files.length; index += 1) {
      hooks.onProgress?.({ ratio: index / files.length, label: 'Juntando PDFs' });
      const src = await PDFDocument.load(fs.readFileSync(files[index]), { ignoreEncryption: true });
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
    }
  } catch {
    throw new ConvertError('Não foi possível juntar os PDFs. Um deles pode estar protegido.', { code: 'PDF' });
  }
  fs.writeFileSync(outPath, await out.save());
  hooks.onProgress?.({ ratio: 1, label: 'Juntando PDFs' });
  return [outPath];
}

const PDF_LEVELS = {
  leve: { scale: 1.5, quality: 0.82 },
  medio: { scale: 1.05, quality: 0.58 },
  forte: { scale: 0.72, quality: 0.38 },
};

export async function compressPdf(file, outPath, level = 'medio', hooks = {}) {
  const preset = PDF_LEVELS[level] || PDF_LEVELS.medio;
  const images = await renderPdfPages(file, {
    scale: preset.scale,
    format: 'jpeg',
    quality: preset.quality,
    hooks,
  });
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (const image of images) {
    const embedded = await doc.embedJpg(image.buffer);
    const page = doc.addPage([embedded.width, embedded.height]);
    page.drawImage(embedded, { x: 0, y: 0, width: embedded.width, height: embedded.height });
  }
  fs.writeFileSync(outPath, await doc.save());
  return [outPath];
}

export async function pdfToPngs(file, hooks = {}) {
  const images = await renderPdfPages(file, { scale: 2, format: 'png', hooks });
  return images.map((image, index) => {
    const out = outputPath(file, 'png', `pagina-${index + 1}`);
    fs.writeFileSync(out, image.buffer);
    return out;
  });
}
