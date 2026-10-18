import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classify } from './actions.js';
import { decodeHeic } from './heic.js';
import { ConvertError } from './errors.js';
import { runFfmpeg, withTemp } from './ffmpeg.js';
import { outputPath } from './output.js';
import { hasEncoder, probe } from './probe.js';
import { rasterSvg } from './svg.js';

const require = createRequire(import.meta.url);

function normalizeRect(rect) {
  const x = Math.max(0, Math.round(Number(rect?.x)));
  const y = Math.max(0, Math.round(Number(rect?.y)));
  const width = Math.round(Number(rect?.width));
  const height = Math.round(Number(rect?.height));
  if (![x, y, width, height].every(Number.isFinite) || width < 1 || height < 1) {
    throw new ConvertError('A área de recorte é inválida.');
  }
  return { x, y, width, height };
}

async function encoderArgs(source, target, quality) {
  if (target === 'jpg') {
    const q = quality?.jpgQ ?? 3;
    return ['-frames:v', '1', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuvj420p', '-q:v', String(q)];
  }
  if (target === 'webp') {
    return ['-frames:v', '1', '-c:v', 'libwebp', '-quality', String(quality?.webpQ ?? 82)];
  }
  if (target === 'avif') {
    const info = probe(source);
    const vf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    const crf = quality?.avifCrf ?? 32;
    if ((info.width || 0) >= 64 && (info.height || 0) >= 64 && hasEncoder('libsvtav1')) {
      return ['-frames:v', '1', '-vf', vf, '-c:v', 'libsvtav1', '-preset', '11', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-still-picture', '1'];
    }
    return ['-frames:v', '1', '-vf', vf, '-c:v', 'libaom-av1', '-still-picture', '1', '-cpu-used', '8', '-crf', String(Math.min(45, crf)), '-pix_fmt', 'yuv420p'];
  }
  if (target === 'gif' || target === 'png') return ['-frames:v', '1'];
  return ['-frames:v', '1'];
}

async function writeIco(source, output, hooks) {
  await withTemp(async (tmp) => {
    const pngs = [];
    for (const size of [256, 48, 32, 16]) {
      const dest = path.join(tmp, `${size}.png`);
      await runFfmpeg([
        '-i', source,
        '-frames:v', '1',
        '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2`,
        dest,
      ], hooks);
      pngs.push(dest);
    }
    const pngToIco = require('png-to-ico');
    fs.writeFileSync(output, await pngToIco(pngs));
  });
}

async function materialize(input, tmp) {
  const info = classify(input);
  if (info.ext === 'svg') {
    const dest = path.join(tmp, 'raster.png');
    await rasterSvg(input, dest);
    return dest;
  }
  if (info.ext === 'heic') {
    const dest = path.join(tmp, 'decoded.jpg');
    await decodeHeic(input, dest);
    return dest;
  }
  return input;
}

export async function transcodeImage(input, target, hooks = {}, options = {}) {
  const tag = options.tag || 'vireun';
  const out = outputPath(input, target === 'jpg' ? 'jpg' : target, tag);
  await withTemp(async (tmp) => {
    const source = await materialize(input, tmp);
    const sourceExt = classify(source).ext;
    if (target === 'png' && sourceExt === 'png' && source !== input) {
      fs.copyFileSync(source, out);
      return;
    }
    if (target === 'jpg' && sourceExt === 'jpg' && source !== input && !options.quality) {
      fs.copyFileSync(source, out);
      return;
    }
    if (target === 'ico') {
      await writeIco(source, out, hooks);
      return;
    }
    if (classify(input).ext === 'gif' && target === 'webp' && !options.quality) {
      await runFfmpeg([
        '-i', source,
        '-c:v', 'libwebp_anim',
        '-loop', '0',
        '-quality', '78',
        out,
      ], { ...hooks, label: hooks.label || 'Convertendo para WEBP' });
      return;
    }
    const args = await encoderArgs(source, target, options.quality);
    await runFfmpeg(['-i', source, ...args, out], {
      ...hooks,
      label: hooks.label || `Convertendo para ${target.toUpperCase()}`,
    });
  });
  return out;
}

const IMAGE_LEVELS = {
  leve: { jpgQ: 6, webpQ: 68, avifCrf: 30 },
  medio: { jpgQ: 12, webpQ: 46, avifCrf: 38 },
  forte: { jpgQ: 18, webpQ: 28, avifCrf: 46 },
};

export function compressImageTarget(ext) {
  if (ext === 'jpg') return 'jpg';
  if (ext === 'webp') return 'webp';
  if (ext === 'avif') return 'avif';
  if (ext === 'heic') return 'jpg';
  return 'webp';
}

export async function compressImage(input, level = 'medio', hooks = {}) {
  const info = classify(input);
  const target = compressImageTarget(info.ext);
  return transcodeImage(input, target, { ...hooks, label: 'Comprimindo' }, {
    tag: 'comprimido',
    quality: IMAGE_LEVELS[level] || IMAGE_LEVELS.medio,
  });
}

export async function cropImage(original, rect, hooks = {}, source) {
  const input = source || original;
  const box = normalizeRect(rect);
  const info = probe(input);
  if (info.width && info.height) {
    if (box.x + box.width > info.width + 1 || box.y + box.height > info.height + 1) {
      throw new ConvertError('A área de recorte passa do tamanho da imagem.');
    }
  }
  const kind = classify(original);
  let ext = ['png', 'jpg', 'webp', 'gif', 'avif'].includes(kind.ext) ? kind.ext : 'png';
  if (kind.ext === 'heic') ext = 'jpg';
  const out = outputPath(original, ext, 'recorte');
  let vf = `crop=${box.width}:${box.height}:${box.x}:${box.y}`;
  if (ext === 'jpg' || ext === 'avif') vf += ',scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const tail = (await encoderArgs(input, ext)).filter((part, index, list) => {
    if (part === '-vf') return false;
    if (index > 0 && list[index - 1] === '-vf') return false;
    return true;
  });
  await runFfmpeg(['-i', input, '-vf', vf, ...tail, out], { ...hooks, label: 'Recortando' });
  return out;
}

export async function previewSource(file) {
  const info = classify(file);
  if (['png', 'jpg', 'webp', 'gif', 'avif', 'bmp'].includes(info.ext)) {
    const meta = probe(file);
    return { path: file, width: meta.width, height: meta.height, tempDir: null };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireun-preview-'));
  const dest = path.join(dir, info.ext === 'heic' ? 'preview.jpg' : 'preview.png');
  if (info.ext === 'svg') await rasterSvg(file, dest, 1200);
  else if (info.ext === 'heic') await decodeHeic(file, dest);
  else await runFfmpeg(['-i', file, '-frames:v', '1', dest], {});
  const meta = probe(dest);
  return { path: dest, width: meta.width, height: meta.height, tempDir: dir };
}
