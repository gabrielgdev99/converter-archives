import { spawnSync } from 'node:child_process';
import { ffmpegPath } from './bins.js';
import { ConvertError } from './errors.js';

export function parseProbeText(text) {
  const dur = String(text).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
  const wh = String(text).match(/,\s*(\d{2,5})x(\d{2,5})/);
  return {
    duration: Number.isFinite(duration) ? duration : 0,
    width: wh ? Number(wh[1]) : 0,
    height: wh ? Number(wh[2]) : 0,
    hasAudio: /Audio:/.test(text),
    hasVideo: /Video:/.test(text),
  };
}

export function lastOutTime(text) {
  const re = /out_time=(\d+):(\d+):(\d+(?:\.\d+)?)/g;
  let match;
  let last = null;
  while ((match = re.exec(String(text)))) {
    last = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }
  return last;
}

export function probe(file) {
  const result = spawnSync(ffmpegPath(), ['-hide_banner', '-i', file], { encoding: 'utf8' });
  if (result.error && result.error.code === 'ENOENT') {
    throw new ConvertError('O FFmpeg não foi encontrado. Reinstale o Vireun Converter.', { code: 'NO_FFMPEG' });
  }
  return parseProbeText(`${result.stdout || ''}\n${result.stderr || ''}`);
}

let encoderText;
export function hasEncoder(name) {
  if (!encoderText) {
    const result = spawnSync(ffmpegPath(), ['-hide_banner', '-encoders'], { encoding: 'utf8' });
    encoderText = `${result.stdout || ''}\n${result.stderr || ''}`;
  }
  return encoderText.includes(name);
}
