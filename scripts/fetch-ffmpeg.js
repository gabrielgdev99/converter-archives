import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dest = path.join(root, 'resources', 'bin', 'win32', 'ffmpeg.exe');
const stamp = path.join(root, 'resources', 'bin', 'win32', 'slim.txt');
if (fs.existsSync(dest) && fs.existsSync(stamp) && fs.statSync(dest).size > 1_000_000) {
  console.log('ffmpeg.exe enxuto ja esta em resources/bin/win32');
  process.exit(0);
}
const built = spawnSync('bash', [path.join(root, 'scripts', 'build-ffmpeg-win.sh')], { stdio: 'inherit' });
process.exit(built.status === 0 ? 0 : built.status || 1);
