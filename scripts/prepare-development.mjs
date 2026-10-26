import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const base=readFileSync(new URL('src/preload.cjs',root),'utf8');
const extra=readFileSync(new URL('editions/developer/preload-extra.cjs',root),'utf8');
writeFileSync(new URL('src/preload-developer.cjs',root),base+'\n'+extra);
writeFileSync(new URL('ui/edition-ui.js',root),readFileSync(new URL('editions/developer/edition-ui.js',root)));
console.log('Developer preload and interface prepared.');
