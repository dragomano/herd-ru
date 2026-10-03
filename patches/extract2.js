// Полное извлечение строк: обычные литералы (включая паддинг) + сегменты template-литералов.
// Показывает только то, чего ещё НЕТ в dict/ru.json (переведённом или ключе).
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'work', 'app', 'out', 'renderer', 'assets');
const dictPath = path.join(__dirname, '..', 'dict', 'ru.json');
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
const known = new Set(Object.keys(dict.translations).flatMap(k => [k, k.trim()]));

const DQ = /"((?:[^"\\\n]|\\.)*)"/g;
const TPL = /`((?:[^`\\]|\\.)*)`/g;

const strings = new Map();
function add(s, f) {
  if (!strings.has(s)) strings.set(s, { n: 0, files: new Set() });
  const e = strings.get(s); e.n++; e.files.add(f);
}

for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  let m;
  DQ.lastIndex = 0;
  while ((m = DQ.exec(src))) add(m[1], f);
  TPL.lastIndex = 0;
  while ((m = TPL.exec(src))) {
    // статические сегменты template-литерала
    for (const seg of m[1].split(/\$\{[^}]*\}/)) if (seg) add('TPL:' + seg, f);
  }
}

function ui(s) {
  if (s.length < 3 || s.length > 200) return false;
  if (/[\\{}<>;=|`]/.test(s)) return false;
  if (!/[a-z]{2}/.test(s)) return false;
  if (!/[A-Za-z]/.test(s[0] === ' ' ? s[1] : s[0])) return false;
  const words = s.trim().split(/\s+/);
  if (words.length === 1) return /^[A-Z][a-z]+$/.test(s.trim()) && !known.has(s.trim());
  return /^[A-Za-z0-9][A-Za-z0-9 ,.:!?'’()%&/+-]*$/.test(s) && /[A-Za-z] [A-Za-z]/.test(s);
}

const fresh = [];
for (const [s, e] of strings) {
  const raw = s.startsWith('TPL:') ? s.slice(4) : s;
  if (known.has(raw) || known.has(raw.trim())) continue; // уже в словаре
  if (!ui(raw)) continue;
  fresh.push({ raw, s, n: e.n, files: [...e.files].map(x => x.replace(/-[A-Za-z0-9_-]{8}\.js/, '')).join(',') });
}
fresh.sort((a, b) => a.raw.localeCompare(b.raw));
fs.writeFileSync(path.join(__dirname, 'fresh-strings.txt'), fresh.map(x => `${x.n}\t${x.files}\t${JSON.stringify(x.raw)}`).join('\n'));
console.log('новых кандидатов:', fresh.length, '-> patches/fresh-strings.txt');
