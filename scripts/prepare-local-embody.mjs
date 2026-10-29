import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

// Until GenUI is published, install one coherent snapshot of the official packages.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/prepare-local-embody.mjs /absolute/path/to/built/embody-checkout');
const names = ['auth', 'cli', 'cloud-contracts', 'core', 'gateway', 'genui', 'host', 'mcp', 'storage', 'testing'];
const root = resolve(import.meta.dirname, '..');
const manifests = Object.fromEntries(await Promise.all(names.map(async name => [name,
  JSON.parse(await readFile(join(source, 'packages', name, 'package.json'), 'utf8'))])));
for (const name of names) {
  const from = join(source, 'packages', name);
  const to = join(root, '.embody', 'framework', name);
  const manifest = structuredClone(manifests[name]);
  for (const group of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, version] of Object.entries(manifest[group] ?? {})) {
      if (version.startsWith('workspace:')) {
        const local = manifests[dependency.replace('@embody/', '')];
        if (!local) throw new Error(`Missing framework snapshot dependency: ${dependency}`);
        manifest[group][dependency] = local.version;
      }
    }
  }
  delete manifest.devDependencies;
  delete manifest.scripts;
  await mkdir(to, { recursive: true });
  await cp(join(from, 'dist'), join(to, 'dist'), { recursive: true });
  if (name === 'cli') await cp(join(from, 'bin'), join(to, 'bin'), { recursive: true });
  for (const file of ['README.md', 'NOTICE']) await cp(join(from, file), join(to, file));
  await cp(join(source, 'LICENSE'), join(to, 'LICENSE'));
  await writeFile(join(to, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
}
const commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile(join(root, '.embody', 'framework', 'source.json'), JSON.stringify({ source: resolve(source), commit }, null, 2) + '\n');
console.log(`Prepared official Embody candidate ${commit}. Run pnpm install from the workspace root.`);
