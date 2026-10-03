// Extract candidate UI strings from renderer chunks + html + main bytecode
const fs = require('fs');
const path = require('path');

const PROJ = path.join(__dirname, '..');
const ROOT = path.join(PROJ, 'work', 'app');
const OUT = path.join(PROJ, 'patches');

const assetsDir = path.join(ROOT, 'out/renderer/assets');
const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'));

// string literal inside double quotes, no newline, allow escapes
const DQ = /"((?:[^"\\\n]|\\.)*)"/g;

/** @type {Map<string, {count:number, files:Set<string>}>} */
const strings = new Map();

function add(s, file) {
  if (!strings.has(s)) strings.set(s, { count: 0, files: new Set() });
  const e = strings.get(s);
  e.count++;
  e.files.add(file);
}

for (const f of files) {
  const src = fs.readFileSync(path.join(assetsDir, f), 'utf8');
  let m;
  DQ.lastIndex = 0;
  while ((m = DQ.exec(src))) add(m[1], f);
}

// html files: visible text between tags + titles
const htmlDir = path.join(ROOT, 'out/renderer');
const htmls = fs.readdirSync(htmlDir).filter(f => f.endsWith('.html'));
const htmlText = [];
for (const f of htmls) {
  const src = fs.readFileSync(path.join(htmlDir, f), 'utf8');
  const t = /<title>([^<]+)<\/title>/g;
  let m;
  while ((m = t.exec(src))) htmlText.push(`${f}: <title>${m[1]}</title>`);
}

// heuristic filter for human-readable UI candidates
function looksUi(s) {
  if (s.length < 2 || s.length > 160) return false;
  if (/\\/.test(s)) return false;          // escaped stuff (paths, code)
  if (/[{}<>;=|`$]/.test(s)) return false; // code-ish
  if (!/[A-Za-z]{3}/.test(s)) return false;
  const words = s.trim().split(/\s+/);
  if (words.length === 1) {
    // single word: capitalized or common lowercase UI verbs
    return /^[A-Z][a-z]+$/.test(s) || /^(search|settings|services|sites|filters?)$/.test(s.toLowerCase());
  }
  // multiword: mostly letters/spaces/punctuation
  return /^[A-Za-z0-9][A-Za-z0-9 ,.:!?'’()%&/+-]*$/.test(s) && /[A-Za-z] [A-Za-z]/.test(s);
}

const candidates = [];
for (const [s, e] of strings) {
  if (looksUi(s)) candidates.push({ s, count: e.count, files: [...e.files].sort() });
}
candidates.sort((a, b) => a.s.localeCompare(b.s));

fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(candidates, null, 1));
fs.writeFileSync(path.join(OUT, 'candidates.txt'), candidates.map(c => `${c.count}\t${c.files.join(',')}\t${c.s}`).join('\n'));
fs.writeFileSync(path.join(OUT, 'html-titles.txt'), htmlText.join('\n'));
console.log('candidates:', candidates.length);
console.log('html titles:', htmlText.length);
console.log('written to patches/candidates.txt');
