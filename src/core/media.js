import fs from 'node:fs';
import path from 'node:path';
import { classify } from './actions.js';
import { ConvertError } from './errors.js';
import { runFfmpeg, withTemp } from './ffmpeg.js';
import { outputPath } from './output.js';
import { probe } from './probe.js';

export function audioCodecArgs(target, quality = 'normal') {
  const mp3q = quality === 'forte' ? '9' : quality === 'medio' ? '7' : quality === 'leve' ? '5' : '2';
  const oggq = quality === 'forte' ? '1' : quality === 'medio' ? '3' : quality === 'leve' ? '4' : '5';
  const aacb = quality === 'forte' ? '64k' : quality === 'medio' ? '96k' : quality === 'leve' ? '128k' : '192k';
  if (target === 'mp3') return ['-vn', '-c:a', 'libmp3lame', '-q:a', mp3q];
  if (target === 'wav') return ['-vn', '-c:a', 'pcm_s16le'];
  if (target === 'aac') return ['-vn', '-c:a', 'aac', '-b:a', aacb];
  if (target === 'ogg') return ['-vn', '-c:a', 'libvorbis', '-q:a', oggq];
  if (target === 'flac') return ['-vn', '-c:a', 'flac'];
  throw new ConvertError('Formato de áudio desconhecido.');
}

export function videoCodecArgs(target, { hasAudio = true, crf = 23, maxWidth = 0 } = {}) {
  if (target === 'gif') {
    return [
      '-t', '15',
      '-an',
      '-vf', 'fps=12,scale=480:-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse',
    ];
  }
  const even = maxWidth > 0
    ? `scale='trunc(min(${maxWidth},iw)/2)*2':-2`
    : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  const video = ['-vf', even];
  if (target === 'webm') {
    const audio = hasAudio ? ['-c:a', 'libopus', '-b:a', '128k'] : ['-an'];
    return [
      ...video,
      '-c:v', 'libvpx-vp9',
      '-crf', String(Math.min(50, crf + 4)),
      '-b:v', '0',
      '-deadline', 'realtime',
      '-cpu-used', '8',
      '-pix_fmt', 'yuv420p',
      ...audio,
    ];
  }
  const audio = hasAudio ? ['-c:a', 'aac', '-b:a', '160k'] : ['-an'];
  const fast = target === 'mp4' || target === 'mov' ? ['-movflags', '+faststart'] : [];
  return [
    ...video,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    ...audio,
    ...fast,
  ];
}

export async function convertVideo(file, target, hooks = {}, options = {}) {
  const info = probe(file);
  const crf = options.crf ?? 23;
  const maxWidth = options.maxWidth ?? 0;
  const out = outputPath(file, target, options.tag || 'vireun');
  const args = ['-i', file, ...videoCodecArgs(target, { hasAudio: info.hasAudio, crf, maxWidth }), out];
  await runFfmpeg(args, {
    ...hooks,
    duration: target === 'gif' ? Math.min(info.duration || 15, 15) : info.duration,
    label: hooks.label || (target === 'gif' ? 'Criando GIF' : `Convertendo para ${target.toUpperCase()}`),
  });
  return out;
}

export async function convertAudio(file, target, hooks = {}, options = {}) {
  const info = probe(file);
  const out = outputPath(file, target, options.tag || 'vireun');
  await runFfmpeg(['-i', file, ...audioCodecArgs(target, options.quality || 'normal'), out], {
    ...hooks,
    duration: info.duration,
    label: hooks.label || `Convertendo para ${target.toUpperCase()}`,
  });
  return out;
}

export async function compressVideo(file, level = 'medio', hooks = {}) {
  const crf = level === 'leve' ? 28 : level === 'forte' ? 36 : 32;
  const maxWidth = level === 'forte' ? 960 : level === 'medio' ? 1280 : 0;
  const ext = classify(file).ext;
  const target = ['mp4', 'mov', 'webm', 'mkv'].includes(ext) ? ext : 'mp4';
  return convertVideo(file, target, { ...hooks, label: 'Comprimindo' }, { crf, maxWidth, tag: 'comprimido' });
}

export async function compressAudio(file, level = 'medio', hooks = {}) {
  const ext = classify(file).ext;
  const target = ext === 'wav' || ext === 'flac' ? 'ogg' : ext;
  return convertAudio(file, target, { ...hooks, label: 'Comprimindo' }, { quality: level, tag: 'comprimido' });
}

export async function trimMedia(file, range, hooks = {}) {
  const start = Number(range?.start);
  const end = Number(range?.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new ConvertError('O fim precisa ser depois do início.');
  }
  if (start < 0) throw new ConvertError('O início não pode ser negativo.');
  const kind = classify(file);
  const info = probe(file);
  if (info.duration && end > info.duration + 0.08) {
    throw new ConvertError('O intervalo fica fora da duração do arquivo.');
  }
  const ext = ['mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'aac', 'ogg', 'flac'].includes(kind.ext) ? kind.ext : 'mp4';
  const out = outputPath(file, ext, 'aparado');
  const span = Math.max(0.1, end - start);
  const codec = kind.kind === 'audio'
    ? audioCodecArgs(ext)
    : videoCodecArgs(ext, { hasAudio: info.hasAudio, crf: 23 });
  await runFfmpeg(['-i', file, '-ss', start.toFixed(3), '-to', end.toFixed(3), ...codec, out], {
    ...hooks,
    duration: span,
    label: 'Aparando',
  });
  return out;
}

function concatList(files, listPath) {
  const lines = files.map((file) => `file '${file.replace(/'/g, `'\\''`)}'`);
  fs.writeFileSync(listPath, `${lines.join('\n')}\n`);
}

export async function mergeVideos(files, hooks = {}) {
  if (files.length < 2) throw new ConvertError('Juntar precisa de pelo menos dois vídeos.');
  const first = classify(files[0]).ext;
  const target = ['mp4', 'mov', 'webm', 'mkv'].includes(first) ? first : 'mp4';
  const out = outputPath(files[0], target, 'junto');
  let duration = 0;
  let hasAudio = true;
  for (const file of files) {
    const info = probe(file);
    duration += info.duration || 0;
    if (!info.hasAudio) hasAudio = false;
  }
  await withTemp(async (tmp) => {
    const list = path.join(tmp, 'lista.txt');
    concatList(files, list);
    await runFfmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', list,
      ...videoCodecArgs(target, { hasAudio, crf: 23 }),
      out,
    ], { ...hooks, duration, label: 'Juntando vídeos' });
  });
  return out;
}

export async function mergeAudios(files, hooks = {}) {
  if (files.length < 2) throw new ConvertError('Juntar precisa de pelo menos dois áudios.');
  const exts = new Set(files.map((file) => classify(file).ext));
  const target = exts.size === 1 ? [...exts][0] : 'mp3';
  const out = outputPath(files[0], target, 'junto');
  let duration = 0;
  for (const file of files) duration += probe(file).duration || 0;
  await withTemp(async (tmp) => {
    const list = path.join(tmp, 'lista.txt');
    concatList(files, list);
    await runFfmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', list,
      ...audioCodecArgs(target),
      out,
    ], { ...hooks, duration, label: 'Juntando áudios' });
  });
  return out;
}
