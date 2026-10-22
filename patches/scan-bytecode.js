const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { extractStrings } = require('./bytecode-strings');

const b = fs.readFileSync(path.join(ROOT, 'work', 'app', 'out', 'main', 'index.jsc'));
const all = extractStrings(b);

// похоже на пункты меню / заголовки: слова с заглавной, есть пробел или одиночное Title-слово
const menu = [];
for (const s of all) {
  if (s.length < 3 || s.length > 90) continue;
  if (!/^[A-Z]/.test(s)) continue;
  if (/[\\{}<>;=|`_/.]/.test(s) && !/…/.test(s)) {
    if (!/^[A-Za-z ]+$/.test(s)) continue;
  }

  const words = s.trim().split(/\s+/);

  if (
    words.length === 1 &&
    !/^(Delete|Loading|Version|Services|Sites|Settings|Quit|Open|Stop|Start|Restart|Update|Help|About|Exit|Docs|Logs|Dumps|Mail|Paths|PHP|Node|Donate|Unpin|Pin)$/.test(
      s,
    )
  )
    continue;

  if (!/^[A-Za-z0-9 %&'’,.\-…:!()]+$/.test(s)) continue;

  menu.push(s);
}

const uniq = [...new Set(menu)].sort();
fs.writeFileSync(path.join(ROOT, 'patches', 'main-menu-strings.txt'), uniq.join('\n'));
console.log('кандидатов меню в байткоде:', uniq.length, '-> patches/main-menu-strings.txt');

// точечные проверки
for (const probe of [
  'Add Path',
  'Add path',
  'Open PHP Binary',
  'It looks like you don',
  'Loading',
  'Delete',
  'Version',
  'Quick access',
  'Use PHP',
]) {
  const hit = [...all].filter(s => s.includes(probe));
  console.log(
    '[' +
      probe +
      '] ' +
      (hit.length
        ? hit
            .slice(0, 6)
            .map(x => JSON.stringify(x))
            .join(' | ')
        : 'НЕТ в байткоде'),
  );
}

// рендерер: "It looks like you don" и прочие с апострофом
const dir = path.join(ROOT, 'work', 'app', 'out', 'renderer', 'assets');
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(dir + '/' + f, 'utf8');
  for (const probe of ['you don', 'Loading', 'Delete', 'Quick access', 'Version ']) {
    let i = src.indexOf('"' + probe);
    if (i === -1) i = src.indexOf('`' + probe);
    if (i !== -1)
      console.log(
        '[' +
          probe +
          '|' +
          f +
          '] ...' +
          src.slice(Math.max(0, i - 70), i + 120).replace(/\n/g, '|') +
          '...',
      );
  }
}
