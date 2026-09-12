import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';

// External-package equivalent of the pinned Harness lazy-CJS artifact contract.
// The official preset is repository-local (docs/cookbook/adding-a-settings-card.md).
// Only shared platform identities remain require() calls; no Host module may enter.
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const external = ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'];
const result = await build({ entryPoints: ['src/client/index.tsx'], outfile: 'dist/client.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic', sourcemap: true, metafile: true,
  external, loader: { '.css': 'text' }, define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' } });
for (const file of Object.values(result.metafile.outputs)) for (const imp of file.imports) {
  if (imp.external && !external.includes(imp.path)) throw new Error(`Unapproved browser external: ${imp.path}`);
}
console.log(`Client: ${result.metafile.outputs['dist/client.js'].bytes} bytes; shared React/primitives; no Host runtime`);
