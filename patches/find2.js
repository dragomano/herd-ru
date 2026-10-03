// Найти указанные строки в чанках (включая template-литералы) и показать контекст
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'work', 'app', 'out', 'renderer', 'assets');

const targets = [
  'Stop all services',
  'to install and manage PHP versions',
  'Logs`',
  'The default IDE to open',
  'Herd exposes an internal API',
  'The HerdHelper is a Windows Service',
  'You can access the logs at',
  'Learn how to customize this tab',
  'Ungrouped',
  'Start a fresh Laravel project',
  'Open php.ini directory',
  'Add Path',
  '"General"',
  '"Next"',
  '"Previous"',
  'Logs"',
];

for (const t of targets) {
  console.log('### ' + t);
  let found = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    let i = 0;
    while ((i = src.indexOf(t, i)) !== -1 && found < 8) {
      console.log('  [' + f + '] ...' + src.slice(Math.max(0, i - 110), i + t.length + 130).replace(/\n/g, '|') + '...');
      i += t.length;
      found++;
    }
  }
  if (!found) console.log('  НЕ НАЙДЕНО');
}
