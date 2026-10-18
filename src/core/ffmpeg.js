import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ffmpegPath } from './bins.js';
import { Cancelled, ConvertError } from './errors.js';
import { lastOutTime } from './probe.js';

export function friendlyFfmpegError(stderr) {
  const text = String(stderr || '');
  if (/unknown encoder|encoder not found/i.test(text)) {
    return 'Este formato não está disponível no FFmpeg instalado.';
  }
  if (/invalid data|error while decoding|moov atom not found/i.test(text)) {
    return 'O arquivo parece corrompido ou o formato não é compatível.';
  }
  if (/no such file/i.test(text)) {
    return 'O arquivo de origem não foi encontrado.';
  }
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const useful = [...lines].reverse().find((line) => /error|invalid|failed|not found|unknown/i.test(line));
  if (useful) return `Não foi possível converter. ${useful.slice(0, 180)}`;
  return 'Não foi possível converter este arquivo.';
}

function killChild(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
}

export function runFfmpeg(args, hooks = {}) {
  const { onProgress, signal, duration = 0, label = 'Convertendo' } = hooks;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Cancelled());
      return;
    }
    const child = spawn(
      ffmpegPath(),
      ['-hide_banner', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...args],
      { windowsHide: true },
    );
    let stderr = '';
    let stdout = '';
    const onAbort = () => killChild(child);
    signal?.addEventListener('abort', onAbort);
    child.stdout?.on('data', (buf) => {
      stdout += buf.toString();
      if (stdout.length > 80000) stdout = stdout.slice(-30000);
      const time = lastOutTime(stdout);
      if (time != null && duration > 0) {
        onProgress?.({ ratio: Math.max(0, Math.min(0.99, time / duration)), label });
      }
    });
    child.stderr?.on('data', (buf) => {
      stderr += buf.toString();
      if (stderr.length > 120000) stderr = stderr.slice(-40000);
    });
    child.on('error', (err) => {
      signal?.removeEventListener('abort', onAbort);
      if (err.code === 'ENOENT') {
        reject(new ConvertError('O FFmpeg não foi encontrado. Reinstale o Vireun Converter.', { code: 'NO_FFMPEG' }));
        return;
      }
      reject(err);
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(new Cancelled());
        return;
      }
      if (code === 0) {
        onProgress?.({ ratio: 1, label });
        resolve();
        return;
      }
      reject(new ConvertError(friendlyFfmpegError(stderr), { code: 'FFMPEG' }));
    });
  });
}

export async function withTemp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireun-'));
  try {
    return await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
