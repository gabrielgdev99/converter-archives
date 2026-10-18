export function registrySpec(exePath) {
  return {
    key: 'HKCU\\Software\\Classes\\*\\shell\\VireunConverter',
    name: 'Converter com Vireun',
    command: `"${exePath}" --convert "%1"`,
    icon: `${exePath},0`,
  };
}

export function filesFromArgv(argv, exists = () => true) {
  const args = argv.map(String);
  const index = args.indexOf('--convert');
  if (index === -1) return [];
  const files = [];
  for (const arg of args.slice(index + 1)) {
    if (arg.startsWith('--')) break;
    if (exists(arg)) files.push(arg);
  }
  return files;
}
