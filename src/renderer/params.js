window.vireun.payload().then((data) => {
document.getElementById(data.mode).hidden = false;

function clock(seconds) {
  const safe = Math.max(0, seconds || 0);
  const minutes = Math.floor(safe / 60);
  const rest = Math.floor(safe % 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

if (data.mode === 'info') {
  document.getElementById('info-title').textContent = data.title;
  document.getElementById('info-body').textContent = data.body;
  document.getElementById('info-ok').addEventListener('click', () => window.vireun.close());
}

if (data.mode === 'compress') {
  document.getElementById('compress-file').textContent = data.fileName;
  const note = document.getElementById('compress-note');
  note.textContent = data.note;
  if (data.danger) note.classList.add('warn');
  const box = document.getElementById('levels');
  for (const level of data.levels) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'level';
    button.innerHTML = `<strong>${level.label}</strong><span>${level.hint}</span>`;
    button.addEventListener('click', () => window.vireun.submit({ level: level.id }));
    box.appendChild(button);
  }
  document.getElementById('compress-cancel').addEventListener('click', () => window.vireun.close());
}

if (data.mode === 'trim') {
  document.getElementById('trim-file').textContent = data.fileName;
  const start = document.getElementById('start');
  const end = document.getElementById('end');
  const duration = Math.max(0.2, data.duration || 0);
  start.max = duration;
  end.max = duration;
  end.value = duration;
  const poster = document.getElementById('poster');
  if (data.mediaUrl) {
    poster.hidden = false;
    poster.src = data.mediaUrl;
    poster.onerror = async () => {
      const url = await window.vireun.fileData(data.token);
      if (url) poster.src = url;
    };
  }
  const paint = () => {
    let a = Number(start.value);
    let b = Number(end.value);
    if (b <= a) {
      b = Math.min(duration, a + 0.1);
      end.value = b;
    }
    document.getElementById('start-label').textContent = clock(a);
    document.getElementById('end-label').textContent = clock(b);
    document.getElementById('trim-meta').textContent = `Trecho de ${clock(b - a)}. Duração total ${clock(duration)}.`;
  };
  start.addEventListener('input', paint);
  end.addEventListener('input', paint);
  paint();
  document.getElementById('trim-cancel').addEventListener('click', () => window.vireun.close());
  document.getElementById('trim-ok').addEventListener('click', () => {
    window.vireun.submit({ trim: { start: Number(start.value), end: Number(end.value) } });
  });
}

if (data.mode === 'crop') {
  document.getElementById('crop-file').textContent = data.fileName;
  const stage = document.getElementById('stage');
  const pic = document.getElementById('pic');
  const sel = document.getElementById('sel');
  const meta = document.getElementById('crop-meta');
  const ok = document.getElementById('crop-ok');
  pic.src = data.mediaUrl;
  pic.onerror = async () => {
    const url = await window.vireun.fileData(data.token);
    if (url) {
      pic.onerror = null;
      pic.src = url;
    }
  };
  let drag = null;
  let box = null;

  function contentRect() {
    const image = pic.getBoundingClientRect();
    const host = stage.getBoundingClientRect();
    const scale = Math.min(image.width / pic.naturalWidth, image.height / pic.naturalHeight);
    const w = pic.naturalWidth * scale;
    const h = pic.naturalHeight * scale;
    return {
      x: image.left + (image.width - w) / 2 - host.left,
      y: image.top + (image.height - h) / 2 - host.top,
      w,
      h,
      scale,
    };
  }

  function paint(rect) {
    sel.hidden = false;
    sel.style.left = `${rect.x}px`;
    sel.style.top = `${rect.y}px`;
    sel.style.width = `${rect.w}px`;
    sel.style.height = `${rect.h}px`;
  }

  stage.addEventListener('pointerdown', (event) => {
    if (!pic.naturalWidth) return;
    const host = stage.getBoundingClientRect();
    drag = { x: event.clientX - host.left, y: event.clientY - host.top };
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const host = stage.getBoundingClientRect();
    const x = event.clientX - host.left;
    const y = event.clientY - host.top;
    const content = contentRect();
    const left = Math.max(content.x, Math.min(drag.x, x));
    const top = Math.max(content.y, Math.min(drag.y, y));
    const right = Math.min(content.x + content.w, Math.max(drag.x, x));
    const bottom = Math.min(content.y + content.h, Math.max(drag.y, y));
    box = { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top), content };
    paint(box);
    const px = Math.round(box.w / content.scale);
    const py = Math.round(box.h / content.scale);
    meta.textContent = px > 1 && py > 1 ? `${px} x ${py} px` : 'Arraste para marcar a área.';
    ok.disabled = !(px > 1 && py > 1);
  });
  stage.addEventListener('pointerup', () => { drag = null; });
  document.getElementById('crop-cancel').addEventListener('click', () => window.vireun.close());
  ok.addEventListener('click', () => {
    if (!box) return;
    const content = box.content;
    window.vireun.submit({
      crop: {
        x: Math.round((box.x - content.x) / content.scale),
        y: Math.round((box.y - content.y) / content.scale),
        width: Math.round(box.w / content.scale),
        height: Math.round(box.h / content.scale),
      },
    });
  });
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.vireun.close();
});
});
