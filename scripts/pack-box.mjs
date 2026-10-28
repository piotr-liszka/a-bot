// Packs the sandbox into dist/box: Docker build context with the bundled agent.
// The desktop app ships this folder and uploads it to workers over SSH.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
writeFileSync(join(out, 'VERSION'), `${pkg.version}\n`);
console.log(`packed ${out}`);
