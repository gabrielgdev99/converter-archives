import path from 'node:path';
import { findSoffice, officeMissingMessage } from './office.js';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'heic', 'heif', 'gif', 'ico', 'bmp', 'tif', 'tiff', 'svg']);
const VIDEO = new Set(['mp4', 'mov', 'webm', 'mkv', 'm4v']);
const AUDIO = new Set(['mp3', 'wav', 'aac', 'ogg', 'flac']);
const OFFICE = new Set(['docx', 'xlsx', 'pptx']);

const KIND_NOUN = {
  image: ['imagem', 'imagens'],
  video: ['vídeo', 'vídeos'],
  audio: ['áudio', 'áudios'],
  pdf: ['PDF', 'PDFs'],
  office: ['documento', 'documentos'],
};

const KIND_TITLE = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  pdf: 'PDF',
  office: 'Documento',
};

export function classify(filePath) {
  const base = path.basename(filePath);
  const raw = path.extname(filePath).slice(1).toLowerCase();
  let ext = raw;
  if (raw === 'jpeg') ext = 'jpg';
  if (raw === 'heif') ext = 'heic';
  if (raw === 'm4v') ext = 'mp4';
  if (raw === 'tif') ext = 'tiff';
  let kind = null;
  if (IMAGE.has(raw)) kind = 'image';
  else if (VIDEO.has(raw)) kind = 'video';
  else if (AUDIO.has(raw)) kind = 'audio';
  else if (raw === 'pdf') kind = 'pdf';
  else if (OFFICE.has(raw)) kind = 'office';
  return { ext, raw, kind, base, path: filePath };
}

function action(partial) {
  return {
    enabled: true,
    reason: '',
    needs: null,
    children: null,
    group: 'formato',
    ...partial,
  };
}

function formatAction(id, label, description, group = 'formato') {
  return action({ id, label, description, group });
}

const AUDIO_TARGETS = [
  ['mp3', 'MP3', 'Converter para MP3'],
  ['wav', 'WAV', 'Converter para WAV'],
  ['aac', 'AAC', 'Converter para AAC'],
  ['ogg', 'OGG', 'Converter para OGG'],
  ['flac', 'FLAC', 'Converter para FLAC'],
];

const VIDEO_TARGETS = [
  ['mp4', 'MP4', 'Converter para MP4'],
  ['mov', 'MOV', 'Converter para MOV'],
  ['webm', 'WebM', 'Converter para WebM'],
  ['mkv', 'MKV', 'Converter para MKV'],
];

const IMAGE_TARGETS = [
  ['png', 'PNG', 'Converter para PNG'],
  ['jpg', 'JPG', 'Converter para JPG'],
  ['webp', 'WebP', 'Converter para WebP'],
  ['avif', 'AVIF', 'Converter para AVIF'],
  ['gif', 'GIF', 'Converter para GIF'],
  ['ico', 'ICO', 'Criar um ícone ICO'],
];

function withoutCurrent(list, exts) {
  if (exts.size !== 1) return list;
  const only = [...exts][0];
  return list.filter(([id]) => id !== only);
}

export function compressNote(kind, ext) {
  if (kind === 'pdf') {
    return 'Cada página vira imagem. O texto deixa de ser selecionável e o arquivo costuma ficar menor.';
  }
  if (kind === 'image' && ['png', 'gif', 'svg', 'ico', 'bmp', 'tiff'].includes(ext)) {
    return 'O arquivo comprimido sai em WebP, que pesa menos que este formato.';
  }
  if (kind === 'audio' && (ext === 'wav' || ext === 'flac')) {
    return 'WAV e FLAC são sem perda. A versão comprimida sai em OGG.';
  }
  if (kind === 'video') {
    return 'O vídeo é regravado com menos qualidade. No nível forte, a largura fica em até 960 pixels.';
  }
  return 'Escolha o quanto o arquivo pode encolher.';
}

export const COMPRESS_LEVELS = [
  { id: 'leve', label: 'Leve', hint: 'Qualidade alta, arquivo um pouco menor' },
  { id: 'medio', label: 'Médio', hint: 'Equilíbrio entre tamanho e qualidade' },
  { id: 'forte', label: 'Forte', hint: 'Arquivo bem menor, qualidade menor' },
];

function countLabel(kind, count) {
  const [one, many] = KIND_NOUN[kind];
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function listActions(filePaths, env = {}) {
  const files = filePaths.map(classify);
  const missing = files.find((file) => !file.kind);
  if (missing) {
    return {
      ok: false,
      kind: null,
      title: missing.base,
      summary: 'Arquivo',
      description: 'Este tipo de arquivo não tem conversão.',
      warning: null,
      actions: [],
      files,
    };
  }
  const kinds = new Set(files.map((file) => file.kind));
  if (kinds.size !== 1) {
    return {
      ok: false,
      kind: null,
      title: `${files.length} arquivos`,
      summary: 'Tipos mistos',
      description: 'Selecione arquivos do mesmo tipo.',
      warning: null,
      actions: [],
      files,
    };
  }
  const kind = files[0].kind;
  const many = files.length > 1;
  const exts = new Set(files.map((file) => file.ext));
  const ext = exts.size === 1 ? files[0].ext : '';
  const actions = [];
  const libre = env.libreOffice !== undefined ? Boolean(env.libreOffice) : Boolean(findSoffice());

  if (kind === 'image') {
    for (const [id, label, description] of withoutCurrent(IMAGE_TARGETS, exts)) {
      actions.push(formatAction(`to-${id}`, label, description));
    }
    actions.push(formatAction(
      'to-pdf',
      'PDF',
      many ? 'Juntar as imagens em um PDF' : 'Converter a imagem em PDF',
    ));
    if (!many) {
      actions.push(action({
        id: 'crop',
        label: 'Recortar',
        description: 'Escolher uma área da imagem',
        group: 'ferramenta',
        needs: 'crop',
      }));
    }
    actions.push(action({
      id: 'compress',
      label: 'Comprimir',
      description: compressNote(kind, ext || files[0].ext),
      group: 'ferramenta',
      needs: 'compress',
    }));
  }

  if (kind === 'video') {
    for (const [id, label, description] of withoutCurrent(VIDEO_TARGETS, exts)) {
      actions.push(formatAction(`to-${id}`, label, description));
    }
    actions.push(formatAction('to-gif', 'GIF', 'GIF dos primeiros 15 segundos, largura de 480 pixels'));
    actions.push(action({
      id: 'extract',
      label: 'Áudio',
      description: 'Extrair a faixa de áudio',
      group: 'audio',
      children: AUDIO_TARGETS.map(([id, label, description]) => formatAction(`to-${id}`, label, description, 'audio')),
    }));
    if (!many) {
      actions.push(action({
        id: 'trim',
        label: 'Aparar',
        description: 'Cortar o início ou o fim',
        group: 'ferramenta',
        needs: 'trim',
      }));
    }
    if (many) {
      actions.push(action({
        id: 'merge',
        label: 'Juntar',
        description: 'Juntar os vídeos em um só',
        group: 'ferramenta',
      }));
    }
    actions.push(action({
      id: 'compress',
      label: 'Comprimir',
      description: compressNote(kind, ext || 'mp4'),
      group: 'ferramenta',
      needs: 'compress',
    }));
  }

  if (kind === 'audio') {
    for (const [id, label, description] of withoutCurrent(AUDIO_TARGETS, exts)) {
      actions.push(formatAction(`to-${id}`, label, description, 'audio'));
    }
    if (!many) {
      actions.push(action({
        id: 'trim',
        label: 'Aparar',
        description: 'Cortar o início ou o fim',
        group: 'ferramenta',
        needs: 'trim',
      }));
    }
    if (many) {
      actions.push(action({
        id: 'merge',
        label: 'Juntar',
        description: 'Juntar os áudios em um só',
        group: 'ferramenta',
      }));
    }
    actions.push(action({
      id: 'compress',
      label: 'Comprimir',
      description: compressNote(kind, ext || 'mp3'),
      group: 'ferramenta',
      needs: 'compress',
    }));
  }

  if (kind === 'pdf') {
    actions.push(formatAction('to-png', 'PNG', 'Exportar cada página como PNG'));
    if (many) {
      actions.push(action({
        id: 'merge',
        label: 'Juntar',
        description: 'Juntar os PDFs em um só',
        group: 'ferramenta',
      }));
    }
    actions.push(action({
      id: 'compress',
      label: 'Comprimir',
      description: compressNote('pdf'),
      group: 'ferramenta',
      needs: 'compress',
    }));
  }

  if (kind === 'office') {
    actions.push(action({
      id: 'to-pdf',
      label: 'PDF',
      description: libre ? 'Converter para PDF com o LibreOffice' : officeMissingMessage(),
      enabled: libre,
      reason: libre ? '' : officeMissingMessage(),
    }));
  }

  const title = files.length === 1 ? files[0].base : countLabel(kind, files.length);
  return {
    ok: true,
    kind,
    title,
    summary: KIND_TITLE[kind],
    description: 'Escolha o que fazer',
    warning: kind === 'office' && !libre ? officeMissingMessage() : null,
    actions,
    files,
    compressNote: compressNote(kind, ext || files[0].ext),
  };
}

export function findAction(actions, id) {
  for (const item of actions || []) {
    if (item.id === id) return item;
    if (item.children) {
      const nested = findAction(item.children, id);
      if (nested) return nested;
    }
  }
  return null;
}
