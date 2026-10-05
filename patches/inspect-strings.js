#!/usr/bin/env node
'use strict';

// Объединённый поиск и ручные контекстные проверки renderer.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'work', 'app', 'out', 'renderer', 'assets');
const RENDERER = path.join(ROOT, 'work', 'app', 'out', 'renderer');
function files() { return fs.readdirSync(ASSETS).filter(f => f.endsWith('.js')); }
function read(file) { return fs.readFileSync(path.join(ASSETS, file), 'utf8'); }
function context(src, index, before, after, newline = '|') {
  return src.slice(Math.max(0, index - before), index + after).replace(/\n/g, newline);
}
function search(needle, filter = '') {
  if (!needle) { console.error('Использование: node inspect-strings.js search "строка" [часть имени файла]'); process.exitCode = 1; return; }
  let found = 0;
  for (const file of files()) {
    if (filter && !file.includes(filter)) continue;
    const src = read(file), query = '"' + needle;
    let index = 0;
    while ((index = src.indexOf(query, index)) !== -1) {
      found++;
      console.log(`--- ${file} @${index}`);
      console.log(context(src, index, 90, needle.length + 90, ' | '));
      index += query.length;
      if (found > 40) { console.log('...обрезано'); return; }
    }
  }
  if (!found) console.log('Строка не найдена: ' + needle);
}
const findTargets = ['Stop all services', 'to install and manage PHP versions', 'Logs`', 'The default IDE to open', 'Herd exposes an internal API', 'The HerdHelper is a Windows Service', 'You can access the logs at', 'Learn how to customize this tab', 'Ungrouped', 'Start a fresh Laravel project', 'Open php.ini directory', 'Add Path', '"General"', '"Next"', '"Previous"', 'Logs"'];
function findKnown() {
  for (const target of findTargets) {
    console.log('### ' + target);
    let found = 0;
    for (const file of files()) {
      const src = read(file);
      let index = 0;
      while ((index = src.indexOf(target, index)) !== -1 && found < 8) {
        console.log(`  [${file}] ...${context(src, index, 110, target.length + 130)}...`);
        index += target.length; found++;
      }
    }
    if (!found) console.log('  НЕ НАЙДЕНО');
  }
}
function fragments() {
  console.log('### фрагменты " Logs" / +"Logs" / ${} Logs');
  for (const file of files()) {
    const src = read(file);
    for (const pattern of ['" Logs"', ' Logs`', '`Logs', 'window_title', 'document.title', '.title =']) {
      let index = 0;
      while ((index = src.indexOf(pattern, index)) !== -1) {
        console.log(`  [${file}|${JSON.stringify(pattern)}] ...${context(src, index, 100, 140)}...`);
        index += pattern.length;
      }
    }
  }
  console.log('### Next/Previous вне logViewer');
  for (const file of files()) {
    if (file.startsWith('logViewer')) continue;
    const src = read(file);
    for (const pattern of ['Next', 'Previous']) {
      let index = 0;
      while ((index = src.indexOf('"' + pattern, index)) !== -1) {
        const segment = context(src, index, 80, pattern.length + 60);
        if (/createTextVNode|createBaseVNode|label|content|placeholder/.test(segment)) console.log(`  [${file}|${pattern}] ...${segment}...`);
        index += pattern.length;
      }
    }
  }
}
const risky = {
  services: ['Save', 'Services'],
  settings: ['Cache', 'Record', 'Tabs', 'Working', 'Local', 'Php', 'Open', 'All', 'Error', 'Failed', 'Site', 'Sites', 'Status', 'Version', 'Versions', 'Search', 'Storage', 'Install', 'Installed', 'Preview', 'Date', 'Dumps', 'Logs', 'Mail', 'General', 'About'],
  dumps: ['Cache', 'Right', 'Date', 'All', 'Error', 'Dump', 'Dumps', 'Jobs', 'Logs', 'Mail', 'Views', 'View', 'Query', 'Request', 'Response', 'Table', 'Plain text'],
  logViewer: ['Date', 'Level', 'Message', 'Next', 'Previous'],
  menubar: ['Dumps', 'Logs', 'Mail', 'Quit', 'Check for updates', 'sites', 'services'],
  mails: ['Tabs', 'Headers', 'Key', 'Value', 'Text', 'Raw', 'Content']
};
function requiredChunks(names) {
  const available = files();
  const chunks = {};
  for (const name of names) {
    // Полное имя до hash: settings-helper не является чанком settings.
    chunks[name] = available.filter(file => file.replace(/-[A-Za-z0-9_-]{8}\.js$/, '') === name);
    if (!chunks[name].length) throw new Error(`Не найден обязательный чанк ${name}-<hash>.js в ${ASSETS}`);
  }
  return chunks;
}
function contexts() {
  const chunks = requiredChunks(Object.keys(risky));
  for (const [name, words] of Object.entries(risky)) {
    for (const file of chunks[name]) {
      const src = read(file);
      console.log('=== ' + file + ' ===');
      for (const word of words) {
        const needle = '"' + word + '"'; let index = 0, hits = 0;
        while ((index = src.indexOf(needle, index)) !== -1 && hits < 6) {
          console.log(`  [${word}] ...${context(src, index, 60, needle.length + 60, '\\n')}...`);
          index += needle.length; hits++;
        }
        if (!hits) console.log(`  [${word}] NOT FOUND`);
      }
    }
  }
  console.log('\n=== placeholder/label/title props ===');
  for (const file of files()) {
    const src = read(file), re = /\b(placeholder|label|tooltip|ariaLabel|emptyText|message|detail)\s*:\s*"([^"]{2,80})"/g;
    let match;
    while ((match = re.exec(src))) {
      const value = match[2];
      if (/^[A-Z]/.test(value) && !/^(bg-|text-|flex|font-|border|rounded|absolute|relative|fixed|inline|block|hidden|w-|h-|p[xytrbl]?-|m[xytrbl]?-|space-|grid|col-|dark:|hover:|select-|truncate|shadow|transition|items-|justify-|overflow)/.test(value)) console.log(`${file} | ${match[1]} | ${value}`);
    }
  }
  console.log('\n=== html bodies ===');
  for (const file of fs.readdirSync(RENDERER).filter(f => f.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(RENDERER, file), 'utf8');
    const body = src.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    const text = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) console.log(`${file} | ${text.slice(0, 200)}`);
  }
}
function templateChecks() {
  const chunks = requiredChunks(['logViewer', 'mails', 'settings']);
  for (const file of chunks.logViewer) {
    const tpl = /`((?:[^`\\]|\\.)*)`/g; let match;
    const src = read(file);
    while ((match = tpl.exec(src))) if (/[A-Za-z]{3}/.test(match[1]) && match[1].length < 120 && !/https?:/.test(match[1])) console.log('LV TPL: `' + match[1].replace(/\n/g, '|') + '`');
  }
  for (const file of chunks.mails) {
    const src = read(file);
    let index = src.indexOf('Remove ');
    while (index !== -1) {
      const segment = context(src, index, 90, 110);
      if (/createTextVNode|createBaseVNode/.test(segment)) console.log('MAILS: ...' + segment + '...');
      index = src.indexOf('Remove ', index + 7);
    }
  }
  for (const file of chunks.settings) {
    const src = read(file);
    const index = src.indexOf('" With "');
    console.log('WITH CTX: ' + src.slice(index + 10, index + 700).replace(/\n/g, '|'));
  }
}
function finalChecks() {
  const chunks = requiredChunks(['settings', 'menubar', 'siteWizard']);
  for (const file of chunks.settings) {
    const src = read(file), close = src.indexOf('createTextVNode("Close")');
    console.log('CLOSE CTX:', context(src, close, 350, 40, ' | '));
    const re = /directive_tooltip, "([^"]{2,60})"/g, tips = new Set();
    let match;
    while ((match = re.exec(src))) tips.add(match[1]);
    console.log('SETTINGS TOOLTIPS:', [...tips].join(' | '));
  }
  for (const file of chunks.menubar) {
    const tips = new Set(), src = read(file), re = /content: "([^"]{2,60})"/g;
    let match;
    while ((match = re.exec(src))) tips.add(match[1]);
    console.log('MENUBAR TOOLTIPS:', [...tips].join(' | '));
  }
  for (const file of chunks.siteWizard) {
    const src = read(file);
    for (const word of ['Install Team Support', 'Hide', 'Show', 'Custom starter kit']) printWord(word, src, 'siteWizard');
  }
  for (const file of chunks.settings) {
    const src = read(file);
    for (const word of ['Information', 'Application', 'Dumpserver', 'Add Remote', 'Default IDE', 'Debug Mode', 'All sub-folders', 'Storage', 'Database', 'Debug']) printWord(word, src, 'settings');
  }
}
function printWord(word, src, name) {
  const index = src.indexOf('"' + word);
  console.log(`[${word}]`, index < 0 ? 'NOT FOUND in ' + name : context(src, index, 90, 130, ' | '));
}
const mode = process.argv[2] || 'search';
const modes = {
  search: () => search(process.argv[3], process.argv[4]),
  find: findKnown,
  find2: findKnown,
  find3: fragments,
  fragments,
  contexts,
  'check-contexts': contexts,
  'check-fragments': templateChecks,
  'check-final': finalChecks,
  all: () => {
    findKnown();
    fragments();
    contexts();
    templateChecks();
    finalChecks();
  }
};
function usage() {
  console.log('Использование: node patches/inspect-strings.js <режим> [строка] [фильтр]');
  console.log('Режимы: search, find, fragments, contexts, check-fragments, check-final, all.');
  console.log('search "строка" [часть имени файла] ищет литералы с контекстом.');
  console.log('Алиасы: find2 = find, find3 = fragments, check-contexts = contexts.');
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
