const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'work', 'app', 'out', 'renderer', 'assets');

console.log('### фрагменты " Logs" / +"Logs" / ${} Logs');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const pat of ['" Logs"', ' Logs`', '`Logs', 'window_title', 'document.title', '.title =']) {
    let i = 0;
    while ((i = src.indexOf(pat, i)) !== -1) {
      console.log('  [' + f + '|' + JSON.stringify(pat) + '] ...' + src.slice(Math.max(0, i - 100), i + 140).replace(/\n/g, '|') + '...');
      i += pat.length;
    }
  }
}

console.log('### Next/Previous вне logViewer');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))){
  if (f.startsWith('logViewer')) continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const pat of ['Next', 'Previous']) {
    let i = 0;
    while ((i = src.indexOf('"' + pat, i)) !== -1) {
      const seg = src.slice(Math.max(0, i - 80), i + pat.length + 60).replace(/\n/g, '|');
      if (/createTextVNode|createBaseVNode|label|content|placeholder/.test(seg)) {
        console.log('  [' + f + '|' + pat + '] ...' + seg + '...');
      }
      i += pat.length;
    }
  }
}
