// Packs the sandbox into dist/box: Docker build context with the bundled agent.
// The desktop app ships this folder and uploads it to workers over SSH.
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist/box');

execSync('npm run build -w @a-bot/agent', { cwd: root, stdio: 'inherit' });

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'agent'), { recursive: true });
cpSync(join(root, 'docker'), out, { recursive: true });
cpSync(join(root, 'agent/dist/index.js'), join(out, 'agent/index.js'));

const pkg = JSON.parse(readFileSync(join(root, 'agent/package.json'), 'utf8'));
const runtime = { name: pkg.name, version: pkg.version, private: true, type: 'module', dependencies: pkg.dependencies };
writeFileSync(join(out, 'agent/package.json'), JSON.stringify(runtime, null, 2) + '\n');
// Content hash of the box: the app compares it with what a worker runs and updates the worker when they differ.
const hash = createHash('sha256');
const walk = (dir) => {
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else hash.update(path.slice(out.length)).update(readFileSync(path));
  }
};
walk(out);
writeFileSync(join(out, 'VERSION'), `${pkg.version}+${hash.digest('hex').slice(0, 12)}\n`);
console.log(`packed ${out}`);
