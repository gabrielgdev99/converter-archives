import { createRequire } from 'node:module';
import fs from 'node:fs';
import { ConvertError } from './errors.js';
import { runFfmpeg } from './ffmpeg.js';

const require = createRequire(import.meta.url);

export async function decodeHeic(file, destJpg) {
  try {
    await runFfmpeg(['-i', file, '-frames:v', '1', '-q:v', '2', destJpg], {});
    if (fs.existsSync(destJpg) && fs.statSync(destJpg).size > 32) return;
  } catch {
    /* FFmpeg sem HEIC: tenta o decodificador local */
  }
  try {
    const convert = require('heic-convert');
    const input = fs.readFileSync(file);
    const output = await convert({ buffer: input, format: 'JPEG', quality: 0.92 });
    fs.writeFileSync(destJpg, Buffer.from(output));
  } catch {
    throw new ConvertError(
      'Não foi possível ler este HEIC. O arquivo pode estar corrompido ou usar um perfil incomum.',
      { code: 'HEIC' },
    );
  }
}
