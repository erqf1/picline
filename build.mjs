// Bündelt die Oberfläche in eine Datei: src/renderer/dist/app.js
// node build.mjs --web: Picline im Browser nach site/app/ (wird zu mert.win/pic/app/)
import { build } from 'esbuild';
import fs from 'node:fs';

const dev = process.argv.includes('--dev');
const common = { bundle: true, minify: !dev, sourcemap: dev ? 'inline' : false, legalComments: 'none', logLevel: 'warning' };

if (!process.argv.includes('--web')) {
  await build({ ...common, entryPoints: ['src/renderer/js/app.js'], format: 'iife', target: 'chrome130', outfile: 'src/renderer/dist/app.js' });
} else {
  const out = 'site/app';
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  fs.rmSync(out, { recursive: true, force: true });
  await build({ ...common, entryPoints: ['src/web/main.js'], format: 'iife', target: ['chrome110', 'edge110', 'firefox115', 'safari16'], outfile: `${out}/app.js`, define: { __VERSION__: JSON.stringify(version) } });
  fs.writeFileSync(`${out}/sw.js`, fs.readFileSync('src/web/sw.js', 'utf8').replace('__VERSION__', `${version}-${Date.now().toString(36)}`));
  fs.copyFileSync('src/web/index.html', `${out}/index.html`);
  fs.writeFileSync(`${out}/style.css`, `${fs.readFileSync('src/renderer/style.css', 'utf8')}\n${fs.readFileSync('src/web/web.css', 'utf8')}`);
}
