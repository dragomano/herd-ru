#!/usr/bin/env node
'use strict';

// Объединённый анализатор строк renderer. Режимы сохраняют старые отчёты:
// candidates, fresh, remaining и filter.
const fs = require('fs');
const path = require('path');

const PROJ = path.join(__dirname, '..');
const ROOT = path.join(PROJ, 'work', 'app');
const ASSETS = path.join(ROOT, 'out', 'renderer', 'assets');
const RENDERER = path.join(ROOT, 'out', 'renderer');
const OUT = __dirname;
const DQ = /"((?:[^"\\\n]|\\.)*)"/g;
const TPL = /`((?:[^`\\]|\\.)*)`/g;

function jsFiles() {
  return fs.readdirSync(ASSETS).filter(f => f.endsWith('.js'));
}

function collect({ templates = false, trimSegments = false } = {}) {
  const strings = new Map();
  const add = (s, file) => {
    if (!strings.has(s)) strings.set(s, { count: 0, files: new Set() });
    const entry = strings.get(s);
    entry.count++;
    entry.files.add(file);
  };

  for (const file of jsFiles()) {
    const src = fs.readFileSync(path.join(ASSETS, file), 'utf8');
    let match;

    DQ.lastIndex = 0;
    while ((match = DQ.exec(src))) add(match[1], file);

    if (templates) {
      TPL.lastIndex = 0;

      while ((match = TPL.exec(src))) {
        for (const segment of match[1].split(/\$\{[^}]*\}/)) {
          if (trimSegments ? segment.trim() : segment) add('TPL:' + segment, file);
        }
      }
    }
  }
  return strings;
}

function knownTranslations() {
  const dict = JSON.parse(fs.readFileSync(path.join(PROJ, 'dict', 'ru.json'), 'utf8'));

  return new Set(Object.keys(dict.translations).flatMap(key => [key, key.trim()]));
}

function normalizedFiles(files, starVue = false) {
  return [...files]
    .map(file => {
      let value = file.replace(/-[A-Za-z0-9_-]{8}\.js/, '');
      if (starVue) value = value.replace(/\.vue_vue_type_script_setup_true_lang/, '*');
      return value;
    })
    .join(',');
}

function writeCandidates() {
  const strings = collect();
  const looksUi = s => {
    if (s.length < 2 || s.length > 160 || /\\/.test(s) || /[{}<>;=|`$]/.test(s)) return false;
    if (!/[A-Za-z]{3}/.test(s)) return false;
    const words = s.trim().split(/\s+/);

    if (words.length === 1)
      return (
        /^[A-Z][a-z]+$/.test(s) ||
        /^(search|settings|services|sites|filters?)$/.test(s.toLowerCase())
      );

    return /^[A-Za-z0-9][A-Za-z0-9 ,.:!?'’()%&/+-]*$/.test(s) && /[A-Za-z] [A-Za-z]/.test(s);
  };

  const candidates = [];
  for (const [s, entry] of strings)
    if (looksUi(s)) candidates.push({ s, count: entry.count, files: [...entry.files].sort() });

  candidates.sort((a, b) => a.s.localeCompare(b.s));

  const htmlTitles = [];
  for (const file of fs.readdirSync(RENDERER).filter(f => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(RENDERER, file), 'utf8');
    const title = /<title>([^<]+)<\/title>/g;
    let match;

    while ((match = title.exec(src))) htmlTitles.push(`${file}: <title>${match[1]}</title>`);
  }

  fs.writeFileSync(path.join(OUT, 'candidates.json'), JSON.stringify(candidates, null, 1));
  fs.writeFileSync(
    path.join(OUT, 'candidates.txt'),
    candidates.map(c => `${c.count}\t${c.files.join(',')}\t${c.s}`).join('\n'),
  );
  fs.writeFileSync(path.join(OUT, 'html-titles.txt'), htmlTitles.join('\n'));

  console.log('candidates:', candidates.length);
  console.log('html titles:', htmlTitles.length);
  console.log('written to patches/candidates.txt');
}

function writeFresh() {
  const known = knownTranslations();
  const strings = collect({ templates: true });
  const ui = s => {
    if (s.length < 3 || s.length > 200 || /[\\{}<>;=|`]/.test(s) || !/[a-z]{2}/.test(s))
      return false;

    if (!/[A-Za-z]/.test(s[0] === ' ' ? s[1] : s[0])) return false;

    const words = s.trim().split(/\s+/);
    if (words.length === 1) return /^[A-Z][a-z]+$/.test(s.trim()) && !known.has(s.trim());

    return /^[A-Za-z0-9][A-Za-z0-9 ,.:!?'’()%&/+-]*$/.test(s) && /[A-Za-z] [A-Za-z]/.test(s);
  };

  const fresh = [];
  for (const [value, entry] of strings) {
    const raw = value.startsWith('TPL:') ? value.slice(4) : value;

    if (known.has(raw) || known.has(raw.trim()) || !ui(raw)) continue;

    fresh.push({ raw, value, count: entry.count, files: normalizedFiles(entry.files) });
  }

  fresh.sort((a, b) => a.raw.localeCompare(b.raw));

  fs.writeFileSync(
    path.join(OUT, 'fresh-strings.txt'),
    fresh.map(x => `${x.count}\t${x.files}\t${JSON.stringify(x.raw)}`).join('\n'),
  );

  console.log('новых кандидатов:', fresh.length, '-> patches/fresh-strings.txt');
}

function writeRemaining() {
  const known = knownTranslations();
  const strings = collect({ templates: true, trimSegments: true });
  const CSS =
    /^(bg-|text-|flex|font-|border|rounded|absolute|relative|fixed|inline|block|hidden|w-|h-|p[xytrbl]?-|m[xytrbl]?-|space-|grid|col-|dark:|hover:|focus:|active:|group|select-|truncate|shadow|transition|items-|justify-|overflow|opacity-|duration-|animate-|em:|xs:|lg:|sm:|md:|px-|py-|pt-|pb-|mt-|mb-|ml-|mr-|gap-|placeholder|disabled|cursor|whitespace|no-shrink|!|z-|top-|bottom-|left-|right-|inset-|transform|scale-|rotate-|sticky|clear-|table-|tracking-|leading-|list-|object-|outline|ring-|sr-|divide-|self-|order-|shrink|grow|min-|max-|basis|content-|place|underline|line-through|uppercase|lowercase|capitalize|normal|italic|not-|pointer|snap|scroll|aspect|columns|float|clear|isolation|mix-|filter|blur|brightness|grayscale|invert|sepia|saturate|hue|backdrop|appearance|resize|fill-|stroke|accent-|caret-|will-|contain|touch|user-|writing|orientation|hyphens|break-|decoration|underline-offset|font)/;
  const notUi = s =>
    CSS.test(s) ||
    /-\[|:\[/.test(s) ||
    /^(https?:|\/|\.\/|[A-Za-z]:\\\\|@|#)/.test(s) ||
    (/^[A-Za-z0-9_.$-]+$/.test(s) && !/^ /.test(s)) ||
    /^[\s\d.,:;()[\]{}<>=+*/&|!?%@"'`~^_-]+$/.test(s);
  const out = [];
  for (const [value, entry] of strings) {
    const raw = value.startsWith('TPL:') ? value.slice(4) : value;

    if (known.has(raw) || known.has(raw.trim()) || notUi(raw) || !/[A-Za-z]{2}/.test(raw)) continue;

    const words = raw.trim().split(/\s+/);
    if (words.length === 1 && !/^[A-Z][a-z]+$/.test(raw.trim())) continue;

    out.push({ raw, count: entry.count, files: normalizedFiles(entry.files, true) });
  }

  out.sort((a, b) => a.raw.localeCompare(b.raw, 'ru'));
  fs.writeFileSync(
    path.join(OUT, 'all-remaining.txt'),
    out.map(x => `${x.count}\t${x.files}\t${JSON.stringify(x.raw)}`).join('\n'),
  );

  console.log('осталось непереведённых кандидатов:', out.length, '-> patches/all-remaining.txt');
}

function filterCandidates() {
  if (!fs.existsSync(path.join(OUT, 'candidates.json'))) {
    throw new Error(
      'Нет patches/candidates.json. Сначала выполните node patches/analyze-strings.js candidates.',
    );
  }

  const candidates = JSON.parse(fs.readFileSync(path.join(OUT, 'candidates.json'), 'utf8'));
  // Состав app-чанков прежний; меняющийся hash не участвует в отборе.
  const appChunks = new Set([
    'settings',
    'services',
    'menubar',
    'siteWizard',
    'onboarding',
    'logs',
    'dumps',
    'mails',
    'linkRemoteSite',
    'logViewer',
    'upToDate',
    'updater',
    'Forge',
    'Box.vue_vue_type_script_setup_true_lang',
    'Divider.vue_vue_type_script_setup_true_lang',
    'LightButton',
    'Loading',
    'OnboardingButton.vue_vue_type_script_setup_true_lang',
    'UiCheckbox.vue_vue_type_script_setup_true_lang',
    'UiInput.vue_vue_type_script_setup_true_lang',
    'helper',
    'icon',
    'module',
  ]);
  const noise = new Set([
    'Before Christ',
    'Anno Domini',
    'Animation Start',
    'Animation End',
    'Animation Iteration',
    'Visibility change',
    'Window resize',
    'Auto Resize disabled',
    'Disconnect body MutationObserver',
    'Attach listeners to',
    'Arguments',
    'Array',
    'Aptabase: Failed to send event',
    "Aptabase: to track events in the main process you must import 'trackEvent' from '@aptabase/electron/main'.",
    'Added missing iframe ID: ',
    'Close iframe cancelled by onClose event',
    'Checking connection is from allowed list of origins: ',
    'Checking connection is from: ',
    "Deprecated: '",
    'Deprecation warning: ',
  ]);
  const out = candidates
    .filter(
      c =>
        c.files.some(f => appChunks.has(f.replace(/-[A-Za-z0-9_-]{8}\.js$/, ''))) &&
        !noise.has(c.s),
    )
    .sort((a, b) => a.s.localeCompare(b.s));

  fs.writeFileSync(
    path.join(OUT, 'ui-candidates.txt'),
    out
      .map(
        c =>
          `${c.count}\t${c.files
            .join(',')
            .replace(/\.vue_vue_type_script_setup_true_lang/g, '*')
            .replace(/-[A-Za-z0-9_-]{8}\.js/, '')}\t${c.s}`,
      )
      .join('\n'),
  );

  console.log('ui candidates:', out.length);
}

const mode = process.argv[2] || 'candidates';
const modes = {
  candidates: writeCandidates,
  extract: writeCandidates,
  fresh: writeFresh,
  remaining: writeRemaining,
  filter: filterCandidates,
  'filter-candidates': filterCandidates,
  all: () => {
    writeCandidates();
    filterCandidates();
    writeFresh();
    writeRemaining();
  },
};

function usage() {
  console.log(
    'Использование: node patches/analyze-strings.js [candidates|filter|fresh|remaining|all]',
  );
  console.log(
    'По умолчанию: candidates. filter читает candidates.json, созданный режимом candidates.',
  );
  console.log('Алиасы: extract = candidates, filter-candidates = filter.');
}

if (['--help', '-h', 'help'].includes(mode)) {
  usage();
} else if (!Object.hasOwn(modes, mode)) {
  usage();
  process.exitCode = 1;
} else {
  try {
    modes[mode]();
  } catch (error) {
    console.error('Ошибка: ' + error.message);
    process.exitCode = 1;
  }
}
