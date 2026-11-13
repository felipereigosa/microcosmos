// Bundles the viewer into one self-contained file, web/microcosm.html, that
// opens straight from disk. The packages live outside the synced folder:
//   cd ~/microcosm-build && npm i three esbuild; node ~/microcosm/web/build.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mods = process.env.MICROCOSM_BUILD || path.join(process.env.HOME, 'microcosm-build');
const esbuild = createRequire(mods + '/')('esbuild');
const out = await esbuild.build({
  entryPoints: [path.join(here, 'src/main.js')], bundle: true, minify: true, format: 'iife',
  nodePaths: [path.join(mods, 'node_modules')], loader: { '.json': 'json' }, write: false, target: 'es2020',
});
const js = out.outputFiles[0].text.replace(/<\/script/g, '<\\/script');
const html = fs.readFileSync(path.join(here, 'template.html'), 'utf8').replace('/*BUNDLE*/', () => js);
fs.writeFileSync(path.join(here, 'microcosm.html'), html);
console.log('microcosm.html', (html.length / 1024).toFixed(0), 'KB');
