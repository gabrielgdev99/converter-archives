const card = document.getElementById('card');
const headline = document.getElementById('headline');
const hint = document.getElementById('hint');
window.vireun.payload().then((data) => {
  hint.textContent = `${data.shortcutLabel} abre esta zona. No Explorer: Converter com Vireun.`;
});

function pathsFrom(event) {
  return [...event.dataTransfer.files]
    .map((file) => window.vireun.pathForFile(file))
    .filter(Boolean);
}

window.addEventListener('dragover', (event) => {
  event.preventDefault();
  card.classList.add('hot');
  headline.textContent = 'Pode soltar';
});

window.addEventListener('dragleave', () => {
  card.classList.remove('hot');
  headline.textContent = 'Solte o arquivo';
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  const paths = pathsFrom(event);
  if (paths.length) window.vireun.drop(paths);
});

document.getElementById('close').addEventListener('click', () => window.vireun.close());
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.vireun.close();
});
