import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  Notification,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  nativeImage,
  net,
  protocol,
  screen,
  shell,
} from 'electron';
import { COMPRESS_LEVELS, listActions } from '../core/actions.js';
import { ffmpegPath } from '../core/bins.js';
import { convert } from '../core/convert.js';
import { Cancelled, ConvertError } from '../core/errors.js';
import { runFfmpeg } from '../core/ffmpeg.js';
import { previewSource } from '../core/image.js';
import { findSoffice } from '../core/office.js';
import { probe } from '../core/probe.js';
import { filesFromArgv, registrySpec } from '../core/registry.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.join(here, '../renderer');
const iconPng = path.join(rendererDir, 'icons', 'icon.png');
const trayPng = path.join(rendererDir, 'icons', 'tray.png');

app.setName('Vireun Converter');
app.setAppUserModelId('com.vireun.converter');
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true },
  },
]);

const gotLock = app.requestSingleInstanceLock();
const DEFAULTS = {
  openAtLogin: false,
  shortcut: 'CommandOrControl+Alt+V',
  notify: true,
  contextMenu: true,
};

const tokens = new Map();
const views = new Map();
const queue = [];
let settings = { ...DEFAULTS };
let tray = null;
let dropWin = null;
let settingsWin = null;
let progressWin = null;
let activeControl = null;
let batch = [];
let batchTimer = null;
let firstRun = false;

function log(line) {
  try {
    const dir = app.getPath('userData');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'vireun.log'), `${new Date().toISOString()} ${line}\n`);
  } catch {
    /* a bandeja continua mesmo sem log */
  }
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'config.json');
}

function loadSettings() {
  firstRun = !fs.existsSync(settingsFile());
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    settings = { ...DEFAULTS };
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

function shortcutLabel(accel = settings.shortcut) {
  return String(accel)
    .replaceAll('CommandOrControl', 'Ctrl')
    .replaceAll('Control', 'Ctrl');
}

function ffmpegReady() {
  const bin = ffmpegPath();
  if (fs.existsSync(bin)) return true;
  const result = spawnSync(bin, ['-version'], { windowsHide: true });
  return !result.error && result.status === 0;
}

function publicSettings() {
  return {
    ...settings,
    shortcutLabel: shortcutLabel(),
    platform: process.platform,
    version: app.getVersion(),
    ffmpeg: ffmpegReady(),
    libreOffice: Boolean(findSoffice()),
  };
}

function flag(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) return true;
  return value;
}

function existingFiles(argv) {
  return filesFromArgv(argv, (file) => {
    try {
      return fs.existsSync(file) && fs.statSync(file).isFile();
    } catch {
      return false;
    }
  }).map((file) => path.resolve(file));
}

function webPrefs() {
  return {
    preload: path.join(here, '../preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false,
  };
}

function harden(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

function placeAtCursor(win, width, height) {
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  let x = Math.round(cursor.x - width / 2);
  let y = Math.round(cursor.y - height / 2);
  x = Math.min(Math.max(area.x, x), area.x + area.width - width);
  y = Math.min(Math.max(area.y, y), area.y + area.height - height);
  win.setBounds({ x, y, width, height });
}

function centerNearCursor(win, width, height) {
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const w = Math.min(width, area.width);
  const h = Math.min(height, area.height);
  const x = Math.round(area.x + (area.width - w) / 2);
  const y = Math.round(area.y + (area.height - h) / 2);
  win.setBounds({ x, y, width: w, height: h });
}

function mediaToken(file) {
  const token = randomBytes(16).toString('hex');
  tokens.set(token, file);
  return { token, mediaUrl: `media://${token}/file` };
}

function remember(win, state) {
  views.set(win.webContents.id, state);
  win.on('closed', () => {
    views.delete(win.webContents.id);
    if (!state.submitted && state.tempDir) fs.rmSync(state.tempDir, { recursive: true, force: true });
    if (state.posterDir) fs.rmSync(state.posterDir, { recursive: true, force: true });
  });
}

function openWindow({ width, height, file, transparent = false, taskbar = false, onTop = true, place = 'cursor', focus = true }) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: !taskbar,
    alwaysOnTop: onTop,
    hasShadow: !transparent,
    backgroundColor: transparent ? '#00000000' : '#14110e',
    autoHideMenuBar: true,
    icon: iconPng,
    roundedCorners: true,
    webPreferences: webPrefs(),
  });
  win.removeMenu();
  harden(win);
  if (place === 'cursor') placeAtCursor(win, width, height);
  else if (place === 'center') centerNearCursor(win, width, height);
  else if (place === 'corner') {
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    win.setBounds({
      x: area.x + area.width - width - 20,
      y: area.y + area.height - height - 20,
      width,
      height,
    });
  }
  win.loadFile(path.join(rendererDir, file));
  win.once('ready-to-show', () => {
    if (focus) {
      win.show();
      win.focus();
    } else {
      win.showInactive();
    }
  });
  return win;
}

function openRadial(paths, { allowMissing = false } = {}) {
  const files = allowMissing ? paths : paths.filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  if (!files.length) {
    openInfo('Arquivo não encontrado', 'Não achei um arquivo para converter.');
    return;
  }
  const payload = listActions(files);
  const win = openWindow({ width: 680, height: 680, file: 'radial.html', transparent: true });
  remember(win, { kind: 'radial', files, payload });
  if (!flag('--demo')) {
    const born = Date.now();
    win.on('blur', () => {
      if (Date.now() - born < 500) return;
      if (!win.isDestroyed()) win.close();
    });
  }
}

function toggleDrop(force) {
  if (dropWin && !dropWin.isDestroyed()) {
    if (force === true) {
      dropWin.focus();
      return;
    }
    dropWin.close();
    dropWin = null;
    return;
  }
  dropWin = openWindow({ width: 380, height: 460, file: 'dropzone.html', transparent: true });
  remember(dropWin, { kind: 'drop', payload: { shortcutLabel: shortcutLabel() } });
  dropWin.on('closed', () => { dropWin = null; });
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus();
    return;
  }
  settingsWin = openWindow({
    width: 480,
    height: 740,
    file: 'settings.html',
    taskbar: true,
    onTop: false,
    place: 'center',
  });
  remember(settingsWin, { kind: 'settings', payload: publicSettings() });
  settingsWin.on('closed', () => { settingsWin = null; });
}

function openInfo(title, body) {
  const win = openWindow({ width: 460, height: 320, file: 'params.html', taskbar: true, place: 'center' });
  remember(win, { kind: 'params', payload: { mode: 'info', title, body } });
}

async function openParams(action, files) {
  const file = files[0];
  const fileName = path.basename(file);
  if (action.needs === 'compress') {
    const listed = listActions(files);
    const win = openWindow({ width: 460, height: 520, file: 'params.html', taskbar: true, place: 'center' });
    remember(win, {
      kind: 'params',
      actionId: 'compress',
      files,
      payload: {
        mode: 'compress',
        fileName: files.length > 1 ? listed.title : fileName,
        note: listed.compressNote,
        danger: listed.kind === 'pdf',
        levels: COMPRESS_LEVELS,
      },
    });
    return;
  }
  if (action.needs === 'trim') {
    const meta = probe(file);
    if (!meta.duration) {
      openInfo('Sem duração', 'Não foi possível ler a duração deste arquivo.');
      return;
    }
    let poster = null;
    if (listActions([file]).kind === 'video') {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vireun-poster-'));
      const dest = path.join(dir, 'poster.jpg');
      try {
        await runFfmpeg(['-ss', '0', '-i', file, '-frames:v', '1', '-vf', 'scale=640:-2', dest], {});
        poster = { ...mediaToken(dest), tempDir: dir };
      } catch {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    const win = openWindow({ width: 520, height: poster ? 560 : 420, file: 'params.html', taskbar: true, place: 'center' });
    remember(win, {
      kind: 'params',
      actionId: 'trim',
      files,
      posterDir: poster?.tempDir || null,
      payload: {
        mode: 'trim',
        fileName,
        duration: meta.duration,
        mediaUrl: poster?.mediaUrl || '',
        token: poster?.token || '',
      },
    });
    return;
  }
  if (action.needs === 'crop') {
    try {
      const preview = await previewSource(file);
      const media = mediaToken(preview.path);
      const win = openWindow({ width: 860, height: 700, file: 'params.html', taskbar: true, place: 'center' });
      remember(win, {
        kind: 'params',
        actionId: 'crop',
        files,
        tempDir: preview.tempDir,
        preview,
        payload: {
          mode: 'crop',
          fileName,
          mediaUrl: media.mediaUrl,
          token: media.token,
          width: preview.width,
          height: preview.height,
        },
      });
    } catch (err) {
      openInfo('Não foi possível abrir a imagem', err instanceof ConvertError ? err.message : 'Tente converter para PNG antes de recortar.');
    }
  }
}

function ensureProgress() {
  if (progressWin && !progressWin.isDestroyed()) return progressWin;
  progressWin = openWindow({
    width: 380,
    height: 176,
    file: 'progress.html',
    onTop: true,
    focus: false,
    place: 'corner',
  });
  progressWin.on('closed', () => { progressWin = null; });
  return progressWin;
}

function sendProgress(data) {
  const win = ensureProgress();
  const deliver = () => {
    if (!win.isDestroyed()) win.webContents.send('progress:update', data);
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', deliver);
  else deliver();
  if (!win.isDestroyed()) win.showInactive();
}

function notify(title, body, file) {
  if (!settings.notify || !Notification.isSupported()) return;
  const note = new Notification({ title, body, icon: iconPng });
  if (file) note.on('click', () => shell.showItemInFolder(file));
  note.show();
}

async function runJob(job) {
  const control = new AbortController();
  activeControl = control;
  sendProgress({ state: 'run', ratio: null, label: 'Preparando', detail: '' });
  try {
    const result = await convert(job.actionId, job.files, job.options || {}, {
      signal: control.signal,
      onProgress: (info) => sendProgress({ state: 'run', ratio: info?.ratio ?? null, label: info?.label || 'Convertendo', detail: '' }),
    });
    const outputs = result.outputs || [];
    const detail = outputs.length === 1
      ? path.basename(outputs[0])
      : `${outputs.length} arquivos salvos ao lado dos originais`;
    sendProgress({ state: 'done', ratio: 1, label: 'Concluído', detail, file: outputs[0] || '' });
    notify('Conversão concluída', detail, outputs[0]);
    log(`ok ${job.actionId} ${outputs.join(' | ')}`);
  } catch (err) {
    if (err instanceof Cancelled || err?.code === 'CANCELLED') {
      sendProgress({ state: 'cancelled', ratio: 0, label: 'Cancelado', detail: '' });
      return;
    }
    const message = err instanceof ConvertError ? err.message : 'Não foi possível converter este arquivo.';
    log(err?.stack || message);
    sendProgress({ state: 'error', ratio: 0, label: 'Não foi possível converter', detail: message });
    notify('Não foi possível converter', message);
  } finally {
    if (job.options?.tempDir) fs.rmSync(job.options.tempDir, { recursive: true, force: true });
    activeControl = null;
  }
}

function pump() {
  if (activeControl || queue.length === 0) return;
  const job = queue.shift();
  runJob(job).finally(pump);
}

function startJob(job) {
  queue.push(job);
  pump();
}

function enqueue(files) {
  batch.push(...files);
  clearTimeout(batchTimer);
  batchTimer = setTimeout(() => {
    const unique = [...new Set(batch)];
    batch = [];
    if (unique.length) openRadial(unique);
  }, 700);
}

function applyLogin() {
  try {
    app.setLoginItemSettings({
      openAtLogin: Boolean(settings.openAtLogin) && process.platform === 'win32',
      args: ['--hidden'],
    });
  } catch (err) {
    log(`login ${err.message}`);
  }
}

function applyShortcut() {
  globalShortcut.unregisterAll();
  return globalShortcut.register(settings.shortcut, () => toggleDrop());
}

function applyContextMenu(enabled) {
  if (process.platform !== 'win32') {
    return { ok: false, error: 'O menu do Explorer fica disponível no Windows.' };
  }
  const spec = registrySpec(process.execPath);
  if (!enabled) {
    spawnSync('reg', ['delete', spec.key, '/f'], { windowsHide: true });
    return { ok: true };
  }
  const add = (args) => spawnSync('reg', args, { windowsHide: true, encoding: 'utf8' });
  add(['add', spec.key, '/ve', '/d', spec.name, '/f']);
  add(['add', spec.key, '/v', 'Icon', '/d', spec.icon, '/f']);
  const result = add(['add', `${spec.key}\\command`, '/ve', '/d', spec.command, '/f']);
  if (result.status !== 0) return { ok: false, error: 'Não foi possível gravar o menu do Explorer.' };
  return { ok: true };
}

function createTray() {
  const image = nativeImage.createFromPath(trayPng);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('Vireun Converter');
  const menu = Menu.buildFromTemplate([
    { label: 'Zona de soltar', click: () => toggleDrop(true) },
    { label: 'Configurações', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Sair', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => toggleDrop());
}

function acceptArgv(argv) {
  if (argv.includes('--convert')) {
    const files = existingFiles(argv);
    if (files.length) enqueue(files);
    else openInfo('Arquivo não encontrado', 'O Explorer não entregou um arquivo que dê para abrir.');
    return;
  }
  toggleDrop(true);
}

function boot() {
  loadSettings();
  createTray();
  applyLogin();
  if (!applyShortcut()) log(`atalho recusado: ${settings.shortcut}`);
  if (process.platform === 'win32' && settings.contextMenu) applyContextMenu(true);
  const demo = flag('--demo');
  const shot = flag('--screenshot');
  if (demo === 'settings') openSettings();
  else if (demo === 'drop') toggleDrop(true);
  else if (demo === 'radial' || demo === true) openRadial([path.join(os.tmpdir(), 'foto.png')], { allowMissing: true });
  else if (!flag('--hidden')) {
    const files = existingFiles(process.argv);
    if (files.length) enqueue(files);
    else toggleDrop(true);
  }
  if (firstRun) {
    notify('Vireun Converter está na bandeja', `Atalho ${shortcutLabel()} abre a zona de soltar. No Explorer, use Converter com Vireun.`);
  }
  if (typeof shot === 'string') {
    setTimeout(async () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        const image = await win.capturePage();
        fs.mkdirSync(path.dirname(shot), { recursive: true });
        fs.writeFileSync(shot, image.toPNG());
      }
      app.exit(0);
    }, 900);
  }
}

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (app.isReady()) acceptArgv(argv);
  });

  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    globalShortcut.unregisterAll();
    tray?.destroy();
  });

  ipcMain.handle('view:payload', (event) => views.get(event.sender.id)?.payload || {});

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.handle('radial:choose', async (event, actionId) => {
    const state = views.get(event.sender.id);
    if (!state) return { ok: false };
    const action = (function find(list) {
      for (const item of list || []) {
        if (item.id === actionId) return item;
        const nested = find(item.children);
        if (nested) return nested;
      }
      return null;
    }(state.payload.actions));
    if (!action || action.enabled === false) return { ok: false, reason: action?.reason || '' };
    BrowserWindow.fromWebContents(event.sender)?.close();
    if (action.needs) await openParams(action, state.files);
    else startJob({ actionId, files: state.files, options: {} });
    return { ok: true };
  });

  ipcMain.handle('params:submit', (event, options) => {
    const state = views.get(event.sender.id);
    if (!state?.actionId) return;
    state.submitted = true;
    const job = { actionId: state.actionId, files: state.files, options: { ...options } };
    if (state.preview) {
      job.options.source = state.preview.path;
      job.options.tempDir = state.preview.tempDir;
    }
    BrowserWindow.fromWebContents(event.sender)?.close();
    startJob(job);
  });

  ipcMain.handle('convert:cancel', () => {
    activeControl?.abort();
  });

  ipcMain.handle('shell:show', (_event, file) => {
    if (file && fs.existsSync(file)) shell.showItemInFolder(file);
  });

  ipcMain.handle('drop:paths', (_event, paths) => {
    const files = (paths || []).filter((file) => {
      try { return fs.existsSync(file) && fs.statSync(file).isFile(); } catch { return false; }
    });
    if (dropWin && !dropWin.isDestroyed()) dropWin.close();
    if (files.length) openRadial(files);
    else openInfo('Nada para converter', 'Solte arquivos, não pastas.');
  });

  ipcMain.handle('file:data', (_event, token) => {
    const file = tokens.get(token);
    if (!file || !fs.existsSync(file)) return '';
    const buf = fs.readFileSync(file);
    if (buf.length > 25 * 1024 * 1024) return '';
    const ext = path.extname(file).slice(1).toLowerCase();
    const mime = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      avif: 'image/avif',
      bmp: 'image/bmp',
    }[ext] || 'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });

  ipcMain.handle('settings:set', (_event, patch) => {
    const previous = settings.shortcut;
    settings = { ...settings, ...patch };
    if (patch.shortcut && patch.shortcut !== previous) {
      if (!applyShortcut()) {
        settings.shortcut = previous;
        applyShortcut();
        saveSettings();
        return { ok: false, error: 'Esse atalho não foi aceito. Tente outra combinação.', settings: publicSettings() };
      }
    }
    if (Object.hasOwn(patch, 'openAtLogin')) applyLogin();
    if (Object.hasOwn(patch, 'contextMenu')) {
      const result = applyContextMenu(Boolean(settings.contextMenu));
      if (!result.ok && process.platform === 'win32') {
        saveSettings();
        return { ok: false, error: result.error, settings: publicSettings() };
      }
    }
    saveSettings();
    return { ok: true, settings: publicSettings() };
  });

  app.whenReady().then(() => {
    protocol.handle('media', (request) => {
      try {
        const token = new URL(request.url).hostname;
        const file = tokens.get(token);
        if (!file) return new Response('missing', { status: 404 });
        return net.fetch(pathToFileURL(file).toString());
      } catch {
        return new Response('bad', { status: 400 });
      }
    });
    boot();
  });
}
