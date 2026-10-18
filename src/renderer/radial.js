const FILL = { formato: '#3a2c22', ferramenta: '#24312b', audio: '#3a3226' };
const HOVER = { formato: '#51402f', ferramenta: '#345246', audio: '#514632' };
const STROKE = { formato: '#e08a3c', ferramenta: '#8eae96', audio: '#d4b483' };

const svg = document.getElementById('ring');
const title = document.getElementById('title');
const summary = document.getElementById('summary');
const desc = document.getElementById('desc');
const back = document.getElementById('back');

let rootActions = [];
let stack = [];
let baseDesc = 'Escolha o que fazer';

function polar(cx, cy, radius, angle) {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

function segment(cx, cy, outer, inner, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = polar(cx, cy, outer, a0);
  const [x1, y1] = polar(cx, cy, outer, a1);
  const [x2, y2] = polar(cx, cy, inner, a1);
  const [x3, y3] = polar(cx, cy, inner, a0);
  return `M ${x0} ${y0} A ${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${inner} ${inner} 0 ${large} 0 ${x3} ${y3} Z`;
}

function current() {
  return stack[stack.length - 1] || [];
}

function draw() {
  const actions = current();
  svg.replaceChildren();
  const cx = 340;
  const cy = 340;
  const outer = 286;
  const inner = 108;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = '<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="#000" flood-opacity="0.45"/></filter>';
  svg.appendChild(defs);
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('filter', 'url(#soft)');
  const disc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  disc.setAttribute('cx', cx);
  disc.setAttribute('cy', cy);
  disc.setAttribute('r', inner - 6);
  disc.setAttribute('fill', '#16130f');
  disc.setAttribute('stroke', 'rgba(224,138,60,0.35)');
  disc.setAttribute('stroke-width', '1.5');
  group.appendChild(disc);
  if (!actions.length) {
    svg.appendChild(group);
    back.textContent = 'Fechar';
    return;
  }
  const gap = actions.length > 8 ? 0.035 : 0.05;
  const step = (Math.PI * 2) / actions.length;
  actions.forEach((action, index) => {
    const a0 = index * step + gap / 2;
    const a1 = (index + 1) * step - gap / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', segment(cx, cy, outer, inner, a0, a1));
    const groupName = action.group || 'formato';
    path.setAttribute('fill', FILL[groupName] || FILL.formato);
    path.setAttribute('stroke', STROKE[groupName] || STROKE.formato);
    path.setAttribute('stroke-width', '1.25');
    path.setAttribute('opacity', action.enabled === false ? '0.38' : '1');
    path.style.cursor = 'pointer';
    path.addEventListener('pointerenter', () => {
      path.setAttribute('fill', HOVER[groupName] || HOVER.formato);
      desc.textContent = action.enabled === false ? action.reason : action.description;
    });
    path.addEventListener('pointerleave', () => {
      path.setAttribute('fill', FILL[groupName] || FILL.formato);
      desc.textContent = baseDesc;
    });
    path.addEventListener('click', () => activate(action));
    group.appendChild(path);
    const [tx, ty] = polar(cx, cy, (outer + inner) / 2, (a0 + a1) / 2);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', tx);
    label.setAttribute('y', ty);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('fill', '#f4efe8');
    label.setAttribute('font-size', actions.length > 9 ? '13' : '15');
    label.setAttribute('font-family', 'Outfit Local, Segoe UI, sans-serif');
    label.setAttribute('pointer-events', 'none');
    label.textContent = action.label;
    group.appendChild(label);
  });
  svg.appendChild(group);
  back.textContent = stack.length > 1 ? 'Voltar' : 'Fechar';
}

async function activate(action) {
  if (action.enabled === false) {
    desc.textContent = action.reason || action.description;
    return;
  }
  if (action.children?.length) {
    stack.push(action.children);
    baseDesc = action.description;
    desc.textContent = baseDesc;
    draw();
    return;
  }
  await window.vireun.choose(action.id);
}

back.addEventListener('click', () => {
  if (stack.length > 1) {
    stack.pop();
    baseDesc = 'Escolha o que fazer';
    desc.textContent = baseDesc;
    draw();
    return;
  }
  window.vireun.close();
});

document.body.addEventListener('pointerdown', (event) => {
  if (event.target === document.body || event.target === svg) window.vireun.close();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (stack.length > 1) back.click();
    else window.vireun.close();
  }
});

window.vireun.payload().then((data) => {
  title.textContent = data.title;
  summary.textContent = data.summary || 'Vireun';
  baseDesc = data.warning || data.description || 'Escolha o que fazer';
  desc.textContent = baseDesc;
  rootActions = data.actions || [];
  stack = [rootActions];
  draw();
});
