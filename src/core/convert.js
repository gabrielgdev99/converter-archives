import fs from 'node:fs';
import { classify } from './actions.js';
import { Cancelled, ConvertError } from './errors.js';
import { compressImage, cropImage, transcodeImage } from './image.js';
import {
  compressAudio,
  compressVideo,
  convertAudio,
  convertVideo,
  mergeAudios,
  mergeVideos,
  trimMedia,
} from './media.js';
import { officeToPdf } from './office.js';
import { outputPath } from './output.js';
import { compressPdf, imagesToPdf, mergePdfFiles, pdfToPngs } from './pdf.js';

const IMAGE_TARGETS = new Set(['png', 'jpg', 'webp', 'avif', 'gif', 'ico']);
const VIDEO_TARGETS = new Set(['mp4', 'mov', 'webm', 'mkv', 'gif']);
const AUDIO_TARGETS = new Set(['mp3', 'wav', 'aac', 'ogg', 'flac']);

function assertFiles(files) {
  if (!files?.length) throw new ConvertError('Nenhum arquivo informado.');
  for (const file of files) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      throw new ConvertError('O arquivo de origem não foi encontrado.');
    }
  }
  const kind = classify(files[0]).kind;
  if (!kind) throw new ConvertError('Este tipo de arquivo não tem conversão.');
  if (files.some((file) => classify(file).kind !== kind)) {
    throw new ConvertError('Selecione arquivos do mesmo tipo.');
  }
  return kind;
}

function throwIfCancelled(signal) {
  if (signal?.aborted) throw new Cancelled();
}

async function each(files, hooks, label, fn) {
  const outputs = [];
  for (let index = 0; index < files.length; index += 1) {
    throwIfCancelled(hooks.signal);
    const child = {
      ...hooks,
      onProgress: (info) => {
        const inner = info?.ratio;
        const ratio = inner == null ? null : (index + inner) / files.length;
        hooks.onProgress?.({
          ratio,
          label: files.length > 1 ? `${label} (${index + 1} de ${files.length})` : (info?.label || label),
        });
      },
    };
    const result = await fn(files[index], child);
    outputs.push(...(Array.isArray(result) ? result : [result]));
  }
  return outputs;
}

export async function convert(actionId, files, options = {}, hooks = {}) {
  const kind = assertFiles(files);
  const level = options.level || 'medio';
  hooks.onProgress?.({ ratio: 0, label: 'Preparando' });

  if (actionId === 'crop') {
    if (files.length !== 1) throw new ConvertError('Recortar funciona com uma imagem por vez.');
    const out = await cropImage(files[0], options.crop, hooks, options.source);
    return { outputs: [out] };
  }
  if (actionId === 'trim') {
    if (files.length !== 1) throw new ConvertError('Aparar funciona com um arquivo por vez.');
    const out = await trimMedia(files[0], options.trim, hooks);
    return { outputs: [out] };
  }
  if (actionId === 'compress') {
    if (kind === 'image') {
      const outputs = await each(files, hooks, 'Comprimindo', (file, child) => compressImage(file, level, child));
      return { outputs };
    }
    if (kind === 'video') {
      const outputs = await each(files, hooks, 'Comprimindo', (file, child) => compressVideo(file, level, child));
      return { outputs };
    }
    if (kind === 'audio') {
      const outputs = await each(files, hooks, 'Comprimindo', (file, child) => compressAudio(file, level, child));
      return { outputs };
    }
    if (kind === 'pdf') {
      const outputs = await each(files, hooks, 'Comprimindo', async (file, child) => {
        const out = outputPath(file, 'pdf', 'comprimido');
        await compressPdf(file, out, level, child);
        return out;
      });
      return { outputs };
    }
  }
  if (actionId === 'merge') {
    if (kind === 'pdf') return { outputs: await mergePdfFiles(files, outputPath(files[0], 'pdf', 'junto'), hooks) };
    if (kind === 'video') return { outputs: [await mergeVideos(files, hooks)] };
    if (kind === 'audio') return { outputs: [await mergeAudios(files, hooks)] };
    throw new ConvertError('Não dá para juntar este tipo de arquivo.');
  }
  if (actionId === 'to-pdf' && kind === 'image') {
    const tag = files.length > 1 ? 'junto' : 'vireun';
    return { outputs: await imagesToPdf(files, outputPath(files[0], 'pdf', tag), hooks) };
  }
  if (actionId === 'to-pdf' && kind === 'office') {
    const soffice = options.soffice === undefined ? undefined : options.soffice;
    const outputs = await each(files, hooks, 'Convertendo para PDF', (file, child) => officeToPdf(file, child, soffice));
    return { outputs };
  }
  if (actionId === 'to-png' && kind === 'pdf') {
    const outputs = [];
    for (const file of files) {
      throwIfCancelled(hooks.signal);
      outputs.push(...await pdfToPngs(file, hooks));
    }
    return { outputs };
  }
  if (!actionId.startsWith('to-')) throw new ConvertError('Esta conversão não está disponível.');
  const target = actionId.slice(3);
  if (kind === 'image' && IMAGE_TARGETS.has(target)) {
    const outputs = await each(files, hooks, `Convertendo para ${target.toUpperCase()}`, (file, child) => transcodeImage(file, target, child));
    return { outputs };
  }
  if (kind === 'video' && AUDIO_TARGETS.has(target)) {
    const outputs = await each(files, hooks, `Extraindo ${target.toUpperCase()}`, (file, child) => convertAudio(file, target, child));
    return { outputs };
  }
  if (kind === 'video' && VIDEO_TARGETS.has(target)) {
    const outputs = await each(files, hooks, target === 'gif' ? 'Criando GIF' : `Convertendo para ${target.toUpperCase()}`, (file, child) => convertVideo(file, target, child));
    return { outputs };
  }
  if (kind === 'audio' && AUDIO_TARGETS.has(target)) {
    const outputs = await each(files, hooks, `Convertendo para ${target.toUpperCase()}`, (file, child) => convertAudio(file, target, child));
    return { outputs };
  }
  throw new ConvertError('Esta conversão não está disponível.');
}
