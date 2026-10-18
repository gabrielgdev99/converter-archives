import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const pngToIco = require('png-to-ico');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = path.join(root, 'src', 'renderer', 'icons');
const buildDir = path.join(root, 'build');
fs.mkdirSync(iconDir, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function draw(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size / 256;
  ctx.clearRect(0, 0, size, size);
  roundRect(ctx, 12 * s, 12 * s, 232 * s, 232 * s, 56 * s);
  ctx.fillStyle = '#1a1612';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(128 * s, 132 * s, 74 * s, 0, Math.PI * 2);
  ctx.fillStyle = '#e08a3c';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(92 * s, 108 * s);
  ctx.lineTo(128 * s, 172 * s);
  ctx.lineTo(164 * s, 108 * s);
  ctx.strokeStyle = '#1a1612';
  ctx.lineWidth = Math.max(2, 18 * s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  return canvas.toBuffer('image/png');
}

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pngs = [];
for (const size of sizes) {
  const buf = draw(size);
  const file = path.join(buildDir, `icon-${size}.png`);
  fs.writeFileSync(file, buf);
  pngs.push(file);
  if (size === 256) fs.writeFileSync(path.join(iconDir, 'icon.png'), buf);
  if (size === 32) fs.writeFileSync(path.join(iconDir, 'tray.png'), buf);
}
fs.writeFileSync(path.join(buildDir, 'icon.ico'), await pngToIco(pngs));
console.log('icones prontos');
