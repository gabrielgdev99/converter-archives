import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';

const require = createRequire(import.meta.url);
const asar = require('@electron/asar');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = path.join(root, 'release');
const appSrc = path.join(releaseDir, 'app-src');
const unpacked = path.join(releaseDir, 'win-unpacked');
const outFile = path.join(releaseDir, 'Vireun-Converter-Setup-1.0.0.exe');
const artifactDir = '/opt/cursor/artifacts';

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: root });
  if (result.status !== 0) {
    throw new Error(`${cmd} saiu com codigo ${result.status}`);
  }
}

function publishArtifact(outFile) {
  const limit = 100 * 1024 * 1024;
  const size = fs.statSync(outFile).size;
  if (size > limit) {
    throw new Error(`Instalador com ${size} bytes passa de 100 MB e nao cabe no artefato`);
  }
  fs.mkdirSync(artifactDir, { recursive: true });
  const artifact = path.join(artifactDir, path.basename(outFile));
  fs.rmSync(artifact, { force: true });
  const src = fs.createReadStream(outFile);
  const dest = fs.createWriteStream(artifact);
  return new Promise((resolve, reject) => {
    src.on('error', reject);
    dest.on('error', reject);
    dest.on('finish', () => {
      const written = fs.statSync(artifact).size;
      const magic = Buffer.alloc(2);
      const fd = fs.openSync(artifact, 'r');
      fs.readSync(fd, magic, 0, 2, 0);
      fs.closeSync(fd);
      if (written !== size || magic[0] !== 0x4d || magic[1] !== 0x5a) {
        reject(new Error('Copia do artefato incompleta'));
        return;
      }
      resolve(artifact);
    });
    src.pipe(dest);
  });
}

function copyTree(src, dest) {
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function pruneModules(modulesDest) {
  const drop = [
    ['pdfjs-dist', 'build'],
    ['pdfjs-dist', 'web'],
    ['pdfjs-dist', 'legacy', 'web'],
    ['pdfjs-dist', 'legacy', 'image_decoders'],
    ['pdfjs-dist', 'image_decoders'],
    ['pdfjs-dist', 'types'],
  ];
  for (const parts of drop) fs.rmSync(path.join(modulesDest, ...parts), { recursive: true, force: true });
  const keepFonts = new Set([
    'outfit-latin-ext-400-normal.woff2',
    'outfit-latin-ext-500-normal.woff2',
    'outfit-latin-ext-600-normal.woff2',
    'fraunces-latin-600-normal.woff2',
  ]);
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'test' || entry.name === 'tests' || entry.name === '__tests__') {
          fs.rmSync(full, { recursive: true, force: true });
          continue;
        }
        walk(full);
        continue;
      }
      if (entry.name.endsWith('.map') || entry.name.endsWith('.md') || entry.name.endsWith('.d.ts')) {
        fs.rmSync(full, { force: true });
        continue;
      }
      if (full.includes(`${path.sep}@fontsource${path.sep}`) && entry.name.endsWith('.woff2') && !keepFonts.has(entry.name)) {
        fs.rmSync(full, { force: true });
      }
    }
  };
  walk(modulesDest);
}

console.log('1/6 icones e FFmpeg');
run('node', ['scripts/make-icon.js']);
run('node', ['scripts/fetch-ffmpeg.js']);

console.log('2/6 montando o app');
fs.rmSync(appSrc, { recursive: true, force: true });
fs.mkdirSync(appSrc, { recursive: true });
copyTree(path.join(root, 'src'), path.join(appSrc, 'src'));
fs.copyFileSync(path.join(root, 'package.json'), path.join(appSrc, 'package.json'));
const modulesDest = path.join(appSrc, 'node_modules');
fs.mkdirSync(modulesDest, { recursive: true });
for (const name of fs.readdirSync(path.join(root, 'node_modules'))) {
  if (['electron', '@electron', 'resedit', '.bin', '.cache'].includes(name)) continue;
  copyTree(path.join(root, 'node_modules', name), path.join(modulesDest, name));
}
const napiDir = path.join(modulesDest, '@napi-rs');
if (fs.existsSync(napiDir)) {
  for (const name of fs.readdirSync(napiDir)) {
    if (name !== 'canvas' && name !== 'canvas-win32-x64-msvc') {
      fs.rmSync(path.join(napiDir, name), { recursive: true, force: true });
    }
  }
}
const native = path.join(napiDir, 'canvas-win32-x64-msvc', 'skia.win32-x64-msvc.node');
if (!fs.existsSync(native)) throw new Error('Falta o binario Windows do canvas');
pruneModules(modulesDest);

console.log('3/6 empacotando asar');
const asarFile = path.join(releaseDir, 'app.asar');
fs.rmSync(asarFile, { force: true });
fs.rmSync(`${asarFile}.unpacked`, { recursive: true, force: true });
await asar.createPackageWithOptions(appSrc, asarFile, { unpack: '{**/*.node,**/*.wasm}' });
if (!fs.existsSync(path.join(`${asarFile}.unpacked`, 'node_modules', '@napi-rs', 'canvas-win32-x64-msvc', 'skia.win32-x64-msvc.node'))) {
  throw new Error('O modulo nativo do canvas nao foi descompactado do asar');
}

console.log('4/6 baixando o Electron de Windows');
const version = require('electron/package.json').version;
const cache = path.join(releaseDir, 'cache');
fs.mkdirSync(cache, { recursive: true });
const zip = path.join(cache, `electron-v${version}-win32-x64.zip`);
if (!fs.existsSync(zip)) {
  const url = `https://github.com/electron/electron/releases/download/v${version}/electron-v${version}-win32-x64.zip`;
  run('curl', ['-L', '--fail', '--retry', '3', '-o', zip, url]);
}
fs.rmSync(unpacked, { recursive: true, force: true });
fs.mkdirSync(unpacked, { recursive: true });
run('unzip', ['-q', zip, '-d', unpacked]);
fs.rmSync(path.join(unpacked, 'resources', 'default_app.asar'), { force: true });
const localeDir = path.join(unpacked, 'locales');
if (fs.existsSync(localeDir)) {
  for (const name of fs.readdirSync(localeDir)) {
    if (name !== 'en-US.pak' && name !== 'pt-BR.pak') fs.rmSync(path.join(localeDir, name), { force: true });
  }
}
fs.renameSync(path.join(unpacked, 'electron.exe'), path.join(unpacked, 'Vireun Converter.exe'));
fs.copyFileSync(asarFile, path.join(unpacked, 'resources', 'app.asar'));
copyTree(`${asarFile}.unpacked`, path.join(unpacked, 'resources', 'app.asar.unpacked'));
fs.mkdirSync(path.join(unpacked, 'resources', 'bin'), { recursive: true });
fs.copyFileSync(path.join(root, 'resources', 'bin', 'win32', 'ffmpeg.exe'), path.join(unpacked, 'resources', 'bin', 'ffmpeg.exe'));
const licenseDir = path.join(unpacked, 'resources', 'licenses');
fs.mkdirSync(licenseDir, { recursive: true });
fs.copyFileSync(path.join(root, 'resources', 'licenses', 'FFMPEG-LICENSE.txt'), path.join(licenseDir, 'FFMPEG-LICENSE.txt'));
fs.copyFileSync(path.join(root, 'THIRD_PARTY.txt'), path.join(licenseDir, 'THIRD_PARTY.txt'));

console.log('5/6 icone do executavel');
const exePath = path.join(unpacked, 'Vireun Converter.exe');
const exe = NtExecutable.from(fs.readFileSync(exePath));
const res = NtExecutableResource.from(exe);
const iconFile = Data.IconFile.from(fs.readFileSync(path.join(root, 'build', 'icon.ico')));
Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  1,
  1046,
  iconFile.icons.map((item) => item.data),
);
const versions = Resource.VersionInfo.fromEntries(res.entries);
if (versions[0]) {
  versions[0].setFileVersion(1, 0, 0, 0, 1046);
  versions[0].setProductVersion(1, 0, 0, 0, 1046);
  versions[0].setStringValues({ lang: 1046, codepage: 1200 }, {
    FileDescription: 'Vireun Converter',
    ProductName: 'Vireun Converter',
    CompanyName: 'Vireun',
    LegalCopyright: 'Uso interno da Vireun',
    OriginalFilename: 'Vireun Converter.exe',
  });
  versions[0].outputToResourceEntries(res.entries);
}
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));

console.log('6/6 instalador NSIS');
run('makensis', [
  `-DAPPDIR=${unpacked}`,
  `-DOUTFILE=${outFile}`,
  `-DICON=${path.join(root, 'build', 'icon.ico')}`,
  path.join(root, 'build', 'installer.nsi'),
]);
const setup = fs.readFileSync(outFile);
if (setup[0] !== 0x4d || setup[1] !== 0x5a) throw new Error('O instalador nao e um executavel Windows');
const artifact = await publishArtifact(outFile);
console.log(`instalador: ${outFile} (${Math.round(setup.length / 1024 / 1024)} MB)`);
console.log(`artefato: ${artifact}`);
