import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'index.html');
const [template,styles,data,app,art]=await Promise.all([
  readFile(path.join(root,'template.html'),'utf8'),readFile(path.join(root,'styles.css'),'utf8'),
  readFile(path.join(root,'data.js'),'utf8'),readFile(path.join(root,'app.js'),'utf8'),
  readFile(path.join(root,'assets/atlas.png'))
]);
const js=data.replace(/^export /gm,'')+'\n'+app.replace(/^import .*?;\s*/m,'');
const html=template
  .replace('<link rel="stylesheet" href="styles.css">',`<style>${styles}</style>`)
  .replace('src="assets/atlas.png"',`src="data:image/png;base64,${art.toString('base64')}"`)
  .replace('<script type="module" src="app.js"></script>',`<script>(()=>{\n${js}\n})();</script>`);
await writeFile(output,html);
console.log(`Fristående karta skapad: ${Math.round(Buffer.byteLength(html)/1024)} KiB. Inga externa runtime-beroenden.`);
