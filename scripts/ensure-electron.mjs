// Some npm setups skip dependency install scripts, which leaves Electron without its binary
// ("Electron uninstall"). Download it here if it is missing.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
let electronDir;
try {
  electronDir = dirname(require.resolve('electron/package.json'));
} catch {
  process.exit(0); // electron not installed in this setup (e.g. agent-only install)
}
const pathFile = join(electronDir, 'path.txt');
const binary = existsSync(pathFile) ? join(electronDir, 'dist', readFileSync(pathFile, 'utf8').trim()) : undefined;
if (!binary || !existsSync(binary)) {
  console.log('Downloading the Electron binary…');
  execFileSync(process.execPath, [join(electronDir, 'install.js')], { stdio: 'inherit' });
}
