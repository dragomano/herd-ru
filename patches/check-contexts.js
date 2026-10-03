// Print context around risky strings + collect placeholder/label/title props
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'work', 'app', 'out', 'renderer', 'assets');

const risky = {
  'services-Q6pzQvL4.js': ['Save', 'Services'],
  'settings-DBHSboFi.js': ['Cache', 'Record', 'Tabs', 'Working', 'Local', 'Php', 'Open', 'All', 'Error', 'Failed', 'Site', 'Sites', 'Status', 'Version', 'Versions', 'Search', 'Storage', 'Install', 'Installed', 'Preview', 'Date', 'Dumps', 'Logs', 'Mail', 'General', 'About'],
  'dumps-BjE4DOfj.js': ['Cache', 'Right', 'Date', 'All', 'Error', 'Dump', 'Dumps', 'Jobs', 'Logs', 'Mail', 'Views', 'View', 'Query', 'Request', 'Response', 'Table', 'Plain text'],
  'logViewer-BrSr5sJI.js': ['Date', 'Level', 'Message', 'Next', 'Previous'],
  'menubar-pLGWZsQB.js': ['Dumps', 'Logs', 'Mail', 'Quit', 'Check for updates', 'sites', 'services'],
  'mails-Dx57pwho.js': ['Tabs', 'Headers', 'Key', 'Value', 'Text', 'Raw', 'Content'],
};

for (const [file, words] of Object.entries(risky)) {
  const src = fs.readFileSync(path.join(A, file), 'utf8');
  console.log('=== ' + file + ' ===');
  for (const w of words) {
    const needle = '"' + w + '"';
    let idx = 0, hits = 0;
    while ((idx = src.indexOf(needle, idx)) !== -1 && hits < 6) {
      const from = Math.max(0, idx - 60), to = Math.min(src.length, idx + needle.length + 60);
      console.log('  [' + w + '] ...' + src.slice(from, to).replace(/\n/g, '\\n') + '...');
      idx += needle.length; hits++;
    }
    if (hits === 0) console.log('  [' + w + '] NOT FOUND');
  }
}

console.log('\n=== placeholder/label/title props ===');
for (const f of fs.readdirSync(A).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(A, f), 'utf8');
  const re = /\b(placeholder|label|tooltip|ariaLabel|emptyText|message|detail)\s*:\s*"([^"]{2,80})"/g;
  let m;
  while ((m = re.exec(src))) {
    const v = m[2];
    if (/^[A-Z]/.test(v) && !/^(bg-|text-|flex|font-|border|rounded|absolute|relative|fixed|inline|block|hidden|w-|h-|p[xytrbl]?-|m[xytrbl]?-|space-|grid|col-|dark:|hover:|select-|truncate|shadow|transition|items-|justify-|overflow)/.test(v))
      console.log(f + ' | ' + m[1] + ' | ' + v);
  }
}

console.log('\n=== html bodies ===');
const H = path.join(ROOT, 'work', 'app', 'out', 'renderer');
for (const f of fs.readdirSync(H).filter(f => f.endsWith('.html'))) {
  const src = fs.readFileSync(path.join(H, f), 'utf8');
  const body = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text) console.log(f + ' | ' + text.slice(0, 200));
}
