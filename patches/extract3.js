// Исчерпывающее извлечение: ВСЕ строковые литералы и template-сегменты из ВСЕХ чанков рендерера.
// Фильтруются только очевидные не-UI: CSS-классы, URL, пути, camelCase-идентификаторы.
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'work', 'app', 'out', 'renderer', 'assets');
const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'dict', 'ru.json'), 'utf8'));
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
    for (const seg of m[1].split(/\$\{[^}]*\}/)) if (seg.trim()) add('TPL:' + seg, f);
  }
}

const CSS = /^(bg-|text-|flex|font-|border|rounded|absolute|relative|fixed|inline|block|hidden|w-|h-|p[xytrbl]?-|m[xytrbl]?-|space-|grid|col-|dark:|hover:|focus:|active:|group|select-|truncate|shadow|transition|items-|justify-|overflow|opacity-|duration-|animate-|em:|xs:|lg:|sm:|md:|px-|py-|pt-|pb-|mt-|mb-|ml-|mr-|gap-|placeholder|disabled|cursor|whitespace|no-shrink|!|z-|top-|bottom-|left-|right-|inset-|transform|scale-|rotate-|sticky|clear-|table-|tracking-|leading-|list-|object-|outline|ring-|sr-|divide-|self-|order-|shrink|grow|min-|max-|basis|content-|place|underline|line-through|uppercase|lowercase|capitalize|normal|italic|not-|pointer|snap|scroll|aspect|columns|float|clear|isolation|mix-|filter|blur|brightness|grayscale|invert|sepia|saturate|hue|backdrop|appearance|resize|fill-|stroke|accent-|caret-|will-|contain|touch|user-|writing|orientation|hyphens|break-|decoration|underline-offset|font)/;
const CSS2 = /-\[|:\[/; // произвольные значения tailwind
function notUi(s) {
  if (CSS.test(s) || CSS2.test(s)) return true;
  if (/^(https?:|\/|\.\/|[A-Za-z]:\\\\|@|#)/.test(s)) return true;
  if (/^[A-Za-z0-9_.$-]+$/.test(s) && !/^ /.test(s)) return true; // одиночный токен без пробелов
  if (/^[\s\d.,:;()\[\]{}<>=+*/&|!?%@"'`~^_-]+$/.test(s)) return true;
  return false;
}

const out = [];
for (const [s, e] of strings) {
  const raw = s.startsWith('TPL:') ? s.slice(4) : s;
  if (known.has(raw) || known.has(raw.trim())) continue;
  if (notUi(raw)) continue;
  // человекочитаемость: есть буквы и (пробел или это Title-case слово)
  if (!/[A-Za-z]{2}/.test(raw)) continue;
  const words = raw.trim().split(/\s+/);
  if (words.length === 1 && !/^[A-Z][a-z]+$/.test(raw.trim())) continue;
  out.push({ raw, n: e.n, files: [...e.files].map(x => x.replace(/-[A-Za-z0-9_-]{8}\.js/, '').replace(/\.vue_vue_type_script_setup_true_lang/, '*')).join(',') });
}
out.sort((a, b) => a.raw.localeCompare(b.raw, 'ru'));
fs.writeFileSync(path.join(__dirname, 'all-remaining.txt'), out.map(x => `${x.n}\t${x.files}\t${JSON.stringify(x.raw)}`).join('\n'));
console.log('осталось непереведённых кандидатов:', out.length, '-> patches/all-remaining.txt');
