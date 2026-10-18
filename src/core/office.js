import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ConvertError } from './errors.js';
import { outputPath } from './output.js';

export function officeMissingMessage() {
  return 'O LibreOffice não está instalado. Instale o LibreOffice para converter DOCX, XLSX e PPTX em PDF. O arquivo não sai do seu computador.';
}

export function findSoffice() {
  if (process.env.VIREUN_SOFFICE !== undefined) {
    if (!process.env.VIREUN_SOFFICE) return null;
    return fs.existsSync(process.env.VIREUN_SOFFICE) ? process.env.VIREUN_SOFFICE : null;
  }
  const candidates = process.platform === 'win32'
    ? [
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    ]
    : [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  for (const name of ['soffice', 'libreoffice']) {
    try {
      const found = execFileSync(cmd, [name], { encoding: 'utf8', windowsHide: true })
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (found && fs.existsSync(found)) return found;
    } catch {
      /* not on PATH */
    }
  }
  return null;
}

function runOffice(bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stderr = '';
    child.stderr?.on('data', (buf) => {
      stderr += buf.toString();
    });
    child.on('error', (err) => {
      reject(new ConvertError(`Não foi possível abrir o LibreOffice. ${err.message}`, { code: 'LIBREOFFICE' }));
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new ConvertError('O LibreOffice não conseguiu converter este documento.', { code: 'LIBREOFFICE' }));
    });
  });
}

export async function officeToPdf(file, hooks = {}, soffice = findSoffice()) {
  if (!soffice) throw new ConvertError(officeMissingMessage(), { code: 'LIBREOFFICE_MISSING' });
  const out = outputPath(file, 'pdf', 'vireun');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vireun-office-'));
  try {
    hooks.onProgress?.({ ratio: null, label: 'Convertendo com o LibreOffice' });
    await runOffice(soffice, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', tmp, file]);
    const produced = path.join(tmp, `${path.basename(file, path.extname(file))}.pdf`);
    if (!fs.existsSync(produced)) {
      throw new ConvertError('O LibreOffice não gerou o PDF.', { code: 'LIBREOFFICE' });
    }
    fs.copyFileSync(produced, out);
    hooks.onProgress?.({ ratio: 1, label: 'Convertendo com o LibreOffice' });
    return out;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
