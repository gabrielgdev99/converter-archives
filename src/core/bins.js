import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function projectRoot() {
  return path.resolve(here, '../..');
}

export function ffmpegPath() {
  if (process.env.VIREUN_FFMPEG && fs.existsSync(process.env.VIREUN_FFMPEG)) {
    return process.env.VIREUN_FFMPEG;
  }
  const ext = process.platform === 'win32' ? '.exe' : '';
  const name = `ffmpeg${ext}`;
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, 'bin', name);
    if (fs.existsSync(packaged)) return packaged;
  }
  const plat = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux';
  const dev = path.join(projectRoot(), 'resources', 'bin', plat, name);
  if (fs.existsSync(dev)) return dev;
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
}
