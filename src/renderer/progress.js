const label = document.getElementById('label');
const detail = document.getElementById('detail');
const bar = document.getElementById('bar');
const fill = document.getElementById('fill');
const cancel = document.getElementById('cancel');
const show = document.getElementById('show');
const close = document.getElementById('close');
let file = '';

function paint(data) {
  label.textContent = data.label || 'Convertendo';
  detail.textContent = data.detail || '';
  detail.classList.toggle('error', data.state === 'error');
  file = data.file || '';
  const running = !data.state || data.state === 'run';
  cancel.hidden = !running;
  show.hidden = data.state !== 'done';
  close.hidden = data.state !== 'done' && data.state !== 'error' && data.state !== 'cancelled';
  if (data.ratio == null || data.state === 'run' && data.ratio === 0 && !data.detail) {
    bar.classList.add('indeterminate');
  }
  if (typeof data.ratio === 'number' && data.ratio > 0) {
    bar.classList.remove('indeterminate');
    fill.style.width = `${Math.round(Math.max(0, Math.min(1, data.ratio)) * 100)}%`;
  }
  if (data.state === 'done') {
    bar.classList.remove('indeterminate');
    fill.style.width = '100%';
  }
  if (data.state === 'error' || data.state === 'cancelled') {
    bar.classList.remove('indeterminate');
  }
}

window.vireun.onProgress(paint);
cancel.addEventListener('click', () => window.vireun.cancel());
close.addEventListener('click', () => window.vireun.close());
show.addEventListener('click', () => { if (file) window.vireun.show(file); });
