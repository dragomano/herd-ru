const fs = require('fs');
const path = require('path');
const A = path.join(__dirname, '..', 'work', 'app', 'out', 'renderer', 'assets');
const src = fs.readFileSync(A + '/settings-DBHSboFi.js', 'utf8');

let i = src.indexOf('createTextVNode("Close")');
console.log('CLOSE CTX:', src.slice(Math.max(0, i - 350), i + 40).replace(/\n/g, ' | '));

const re = /directive_tooltip, "([^"]{2,60})"/g;
const tips = new Set(); let m;
while ((m = re.exec(src))) tips.add(m[1]);
console.log('SETTINGS TOOLTIPS:', [...tips].join(' | '));

const mb = fs.readFileSync(A + '/menubar-pLGWZsQB.js', 'utf8');
const re2 = /content: "([^"]{2,60})"/g;
const t2 = new Set();
while ((m = re2.exec(mb))) t2.add(m[1]);
console.log('MENUBAR TOOLTIPS:', [...t2].join(' | '));

const sw = fs.readFileSync(A + '/siteWizard-CTgdLgX3.js', 'utf8');
function ctx(word, s, name) {
  const n = '"' + word;
  let idx = s.indexOf(n);
  if (idx < 0) { console.log('[' + word + '] NOT FOUND in ' + name); return; }
  console.log('[' + word + ']', s.slice(Math.max(0, idx - 90), idx + 130).replace(/\n/g, ' | '));
}
for (const w of ['Install Team Support', 'Hide', 'Show', 'Custom starter kit']) ctx(w, sw, 'siteWizard');
for (const w of ['Information', 'Application', 'Dumpserver', 'Add Remote', 'Default IDE', 'Debug Mode', 'All sub-folders', 'Storage', 'Database', 'Debug']) ctx(w, src, 'settings');
