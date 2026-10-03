#!/usr/bin/env node
// Поиск английской строки по чанкам распакованного приложения с контекстом.
// Использование: node patches/find-string.js "Add Site" [файл-фильтр, напр. settings]
'use strict';
const fs = require('fs');
const path = require('path');

const needle = process.argv[2];
const filter = process.argv[3] || '';
if (!needle) { console.error('Использование: node find-string.js "строка" [часть имени файла]'); process.exit(1); }

const dir = path.join(__dirname, '..', 'work', 'app', 'out', 'renderer', 'assets');
let found = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  if (filter && !f.includes(filter)) continue;
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  const q = '"' + needle;
  let i = 0;
  while ((i = src.indexOf(q, i)) !== -1) {
    found++;
    console.log('--- ' + f + ' @' + i);
    console.log(src.slice(Math.max(0, i - 90), i + needle.length + 90).replace(/\n/g, ' | '));
    i += q.length;
    if (found > 40) { console.log('...обрезано'); process.exit(0); }
  }
}
if (!found) console.log('Строка не найдена: ' + needle);
