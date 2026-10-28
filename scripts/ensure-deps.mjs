// Runs `npm install` when package-lock.json changed since the last install (e.g. after git pull),
// so `npm run dev` just works.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stamp = join(root, 'node_modules/.a-bot-lock-hash');
const hash = createHash('sha256').update(readFileSync(join(root, 'package-lock.json'))).digest('hex');

if (process.argv.includes('--stamp')) {
  // Called from postinstall: dependencies match the lock file now.
  writeFileSync(stamp, hash);
} else if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== hash) {
  console.log('package-lock.json changed: installing dependencies…');
  execSync('npm install', { cwd: root, stdio: 'inherit' });
}
