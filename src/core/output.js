import fs from 'node:fs';
import path from 'node:path';
import { ConvertError } from './errors.js';

export function outputPath(inputPath, ext, tag = 'vireun') {
  const dir = path.dirname(path.resolve(inputPath));
  const stem = path.basename(inputPath, path.extname(inputPath));
  const cleanExt = String(ext).replace(/^\./, '').toLowerCase();
  const cleanTag = String(tag).replace(/^\.+/, '') || 'vireun';
  const resolvedInput = path.resolve(inputPath);
  for (let n = 1; n < 10000; n += 1) {
    const suffix = n === 1 ? '' : `-${n}`;
    const candidate = path.join(dir, `${stem}-${cleanTag}${suffix}.${cleanExt}`);
    if (path.resolve(candidate) === resolvedInput) continue;
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new ConvertError('Não foi possível escolher um nome livre ao lado do arquivo.');
}
