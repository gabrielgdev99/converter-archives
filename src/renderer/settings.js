const shortcut = document.getElementById('shortcut');
const login = document.getElementById('login');
const menu = document.getElementById('menu');
const notify = document.getElementById('notify');
const status = document.getElementById('status');
const note = document.getElementById('windows-note');
let recording = false;
let state = null;

function paint() {
  shortcut.textContent = recording ? 'Pressione o atalho' : state.shortcutLabel;
  login.checked = state.openAtLogin;
  menu.checked = state.contextMenu;
  notify.checked = state.notify;
  const windows = state.platform === 'win32';
  login.disabled = !windows;
  menu.disabled = !windows;
  note.textContent = windows
    ? 'O início automático e o menu do Explorer valem para o app instalado.'
    : 'Iniciar com o Windows e o menu do Explorer existem na versão instalada no Windows.';
  const ffmpeg = state.ffmpeg ? 'FFmpeg pronto' : 'FFmpeg ausente';
  const office = state.libreOffice ? 'LibreOffice encontrado' : 'LibreOffice não encontrado';
  status.textContent = `Versão ${state.version}. ${ffmpeg}. ${office}.`;
}

window.vireun.payload().then((payload) => {
  state = payload;
  paint();
});

shortcut.addEventListener('click', () => {
  recording = true;
  shortcut.classList.add('recording');
  paint();
});

window.addEventListener('keydown', async (event) => {
  if (!recording) return;
  event.preventDefault();
  if (event.key === 'Escape') {
    recording = false;
    shortcut.classList.remove('recording');
    paint();
    return;
  }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
  const parts = [];
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  const result = await window.vireun.saveSettings({ shortcut: parts.join('+') });
  recording = false;
  shortcut.classList.remove('recording');
  state = result.settings;
  paint();
  if (!result.ok) status.textContent = result.error;
});

async function toggle(patch) {
  const result = await window.vireun.saveSettings(patch);
  state = result.settings;
  paint();
  if (!result.ok && result.error) status.textContent = result.error;
}

login.addEventListener('change', () => toggle({ openAtLogin: login.checked }));
menu.addEventListener('change', () => toggle({ contextMenu: menu.checked }));
notify.addEventListener('change', () => toggle({ notify: notify.checked }));
document.getElementById('close').addEventListener('click', () => window.vireun.close());
