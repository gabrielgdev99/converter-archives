import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vireun-test-'));
}

export function ffmpeg(args) {
  execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'pipe' });
}

export function makePng(dir, name = 'foto.png', size = '64x64', color = '0xcc6633') {
  const file = path.join(dir, name);
  ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=${size}`, '-frames:v', '1', file]);
  return file;
}

export function makeJpg(dir, name = 'foto.jpg') {
  const file = path.join(dir, name);
  ffmpeg(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=1', '-frames:v', '1', '-q:v', '1', file]);
  return file;
}

export function makeWav(dir, name = 'tom.wav', seconds = 1) {
  const file = path.join(dir, name);
  ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`, '-c:a', 'pcm_s16le', file]);
  return file;
}

export function makeMp4(dir, name = 'clipe.mp4', seconds = 0.5) {
  const file = path.join(dir, name);
  ffmpeg([
    '-f', 'lavfi', '-i', `testsrc=size=160x120:rate=10:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=880:duration=${seconds}`,
    '-shortest',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    file,
  ]);
  return file;
}

export function magic(file) {
  const buf = fs.readFileSync(file);
  return {
    size: buf.length,
    png: buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG',
    jpg: buf[0] === 0xff && buf[1] === 0xd8,
    webp: buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
    gif: buf.toString('ascii', 0, 3) === 'GIF',
    pdf: buf.toString('ascii', 0, 4) === '%PDF',
    ico: buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0,
    wav: buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE',
    ogg: buf.toString('ascii', 0, 4) === 'OggS',
    flac: buf.toString('ascii', 0, 4) === 'fLaC',
    mp3: buf.toString('ascii', 0, 3) === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0),
    aac: buf[0] === 0xff && (buf[1] & 0xf6) === 0xf0,
    ebml: buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3,
    ftyp: buf.toString('ascii', 4, 8) === 'ftyp',
  };
}

export function formatName(file) {
  return execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=format_name',
    '-of', 'csv=p=0',
    file,
  ], { encoding: 'utf8' }).trim();
}
