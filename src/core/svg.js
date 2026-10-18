import { createRequire } from 'node:module';
import fs from 'node:fs';
import { ConvertError } from './errors.js';
import { runFfmpeg } from './ffmpeg.js';

const require = createRequire(import.meta.url);
let ready;

async function loadResvg() {
  if (!ready) {
    const wasm = await import('@resvg/resvg-wasm');
    const wasmPath = require.resolve('@resvg/resvg-wasm/index_bg.wasm');
    await wasm.initWasm(fs.readFileSync(wasmPath));
    ready = wasm;
  }
  return ready;
}

export async function rasterSvg(svgPath, pngPath, width = 1600) {
  try {
    const { Resvg } = await loadResvg();
    const svg = fs.readFileSync(svgPath);
    const resvg = new Resvg(svg, {
      fitTo: { mode: 'width', value: width },
      font: { loadSystemFonts: false },
    });
    const rendered = resvg.render();
    fs.writeFileSync(pngPath, Buffer.from(rendered.asPng()));
    rendered.free?.();
    resvg.free?.();
    return;
  } catch (err) {
    try {
      await runFfmpeg(['-i', svgPath, '-frames:v', '1', pngPath], {});
      return;
    } catch {
      throw new ConvertError('Não foi possível ler este SVG.', { code: 'SVG', cause: err });
    }
  }
}
