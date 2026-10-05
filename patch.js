#!/usr/bin/env node
/**
 * Herd RU Patcher — локализация Laravel Herd (Windows) на русский язык.
 * Подход A: точная замена английских строковых литералов в минифицированных
 * чанках рендерера + <title> в HTML-окнах, затем пересборка app.asar.
 *
 * Команды:
 *   node patch.js extract   — распаковать установленный app.asar в work/app
 *   node patch.js apply     — применить словарь dict/ru.json к work/app
 *   node patch.js pack      — собрать build/app.asar (+ app.asar.unpacked)
 *   node patch.js install   — установить собранный asar в Program Files
 *   node patch.js restore   — вернуть оригинальный asar из backup/
 *   node patch.js status    — показать текущее состояние
 *
 * Требует Node.js 18+. Установка/восстановление — права администратора.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const asar = require('@electron/asar');
const acorn = require('acorn');

const HERD_DIR = 'C:/Program Files/Herd';
const RESOURCES = path.join(HERD_DIR, 'resources');
const INSTALLED_ASAR = path.join(RESOURCES, 'app.asar');

const ROOT = __dirname;
const BACKUP_ASAR = path.join(ROOT, 'backup', 'app.asar.orig');
const WORK_APP = path.join(ROOT, 'work', 'app');
const BUILD_DIR = path.join(ROOT, 'build');
const BUILD_ASAR = path.join(BUILD_DIR, 'app.asar');
const DICT_PATH = path.join(ROOT, 'dict', 'ru.json');
const REPORT_PATH = path.join(ROOT, 'patches', 'apply-report.json');

// Что выносится за пределы asar (как в оригинальной сборке electron-builder).
// unpack — glob по абсолютному пути файла (префикс **/ обязателен);
// unpackDir — glob по относительному пути каталога: помечает каталоги bin/config/valet
// целиком, за счёт этого dot-файлы (nginx/temp/.ignore, valet/cli/.rnd) тоже выносятся,
// потому что minimatch без опции dot не матчит их через **/.../**/.*.
const UNPACK_GLOB = '{**/resources/{bin,config,valet}/**,**/resources/*.png}';
const UNPACK_DIR_GLOB = 'resources/{bin,config,valet}/**';

const log = (...a) => console.log(...a);
const die = msg => {
  console.error('ОШИБКА: ' + msg);
  process.exit(1);
};

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function herdVersionOf(asarFile) {
  try {
    const pkg = JSON.parse(asar.extractFile(asarFile, 'package.json'));
    return pkg.version;
  } catch {
    return '?';
  }
}

function isHerdRunning() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq Herd.exe" /NH', { encoding: 'utf8' });
    return /Herd\.exe/i.test(out);
  } catch {
    return false;
  }
}

function stopHerd() {
  if (!isHerdRunning()) return;

  log('Herd запущен — закрываю...');

  try {
    execSync('taskkill /IM Herd.exe', { stdio: 'ignore' });
  } catch {
    /* уже закрыт */
  }

  for (let i = 0; i < 20 && isHerdRunning(); i++) {
    execSync('timeout /t 1 /nobreak >nul', { stdio: 'ignore', shell: 'cmd.exe' });
  }

  if (isHerdRunning()) {
    try {
      execSync('taskkill /F /IM Herd.exe', { stdio: 'ignore' });
    } catch {
      /* ignore */
    }
  }
}

function elevatedRun(scriptFile) {
  // Запуск подготовленного .cmd-скрипта с повышением прав (UAC).
  // Скрипт сам пишет лог в build/elevated.log (передача пути через %2 ненадёжна
  // в Start-Process -ArgumentList, поэтому путь зашит в скрипт).
  const logFile = path.join(BUILD_DIR, 'elevated.log');

  try {
    fs.rmSync(logFile, { force: true });
  } catch {
    /* ignore */
  }

  const ps = `Start-Process cmd -Verb RunAs -Wait -ArgumentList '/c ${scriptFile}'`;

  execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: 'inherit' });

  if (fs.existsSync(logFile))
    log('Журнал повышенного запуска:\n' + fs.readFileSync(logFile, 'utf8').trim());
}

function writeElevatedScript(name, lines) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  const file = path.join(BUILD_DIR, name);
  const logFile = path.join(BUILD_DIR, 'elevated.log');
  const body =
    ['@echo off', 'set LOG=' + logFile, ...lines, 'echo DONE >> "%LOG%"'].join('\r\n') + '\r\n';

  fs.writeFileSync(file, body);

  return file;
}

/* ------------------------------ команды ------------------------------ */

function cmdExtract() {
  const src = fs.existsSync(INSTALLED_ASAR) ? INSTALLED_ASAR : BACKUP_ASAR;

  if (!fs.existsSync(src)) die('не найден ни установленный app.asar, ни бэкап');

  log('Распаковываю ' + src + ' -> ' + WORK_APP);

  fs.rmSync(WORK_APP, { recursive: true, force: true });

  // .unpacked-файлы берутся рядом с архивом (у установленного они есть)
  asar.extractAll(src, WORK_APP);

  log('Готово. Версия Herd: ' + herdVersionOf(src));
}

const matchPattern = (file, patterns) => {
  if (!patterns) return true;

  return patterns.some(p => {
    const re = new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return re.test(file);
  });
};

function buildLookup() {
  const dict = JSON.parse(fs.readFileSync(DICT_PATH, 'utf8'));
  const exact = new Map(); // точное содержимое литерала
  const trim = new Map(); // по trim(литерала) — с сохранением паддинга

  for (const [en, valRaw] of Object.entries(dict.translations)) {
    const val =
      typeof valRaw === 'string'
        ? { ru: valRaw, files: null }
        : {
            ru: valRaw.ru,
            files: valRaw.files,
            skipBefore: valRaw.skipBefore,
            paddedOnly: valRaw.paddedOnly,
          };

    if (!val.paddedOnly && !exact.has(en)) exact.set(en, val);

    const t = en.trim();

    if (!trim.has(t)) trim.set(t, val);
  }

  return {
    exact,
    trim,
    titles: dict.htmlTitles || {},
    main: dict.mainProcess || null,
    fixes: dict.valueFixes || [],
  };
}

const SHIM_DICT = path.join(WORK_APP, 'out', 'main', 'ru-main-dict.json');
const SHIM_JS = path.join(WORK_APP, 'out', 'main', 'ru-shim.js');
const MAIN_INDEX = path.join(WORK_APP, 'out', 'main', 'index.js');

const SHIM_SOURCE = `'use strict';
// Herd RU shim — перевод строк главного процесса (меню трея, диалоги, уведомления).
// Строки живут в V8-байткоде (index.jsc), поэтому перехватываем Electron API
// до его загрузки. Все ошибки глушатся, чтобы не мешать запуску Herd.
(function () {
  try {
    const electron = require('electron');
    const fs = require('fs');
    const path = require('path');
    const dict = require('./ru-main-dict.json');
    const rules = (dict.rules || []).map(function (r) { return { re: new RegExp(r.match), replace: r.replace }; });

    function translate(s) {
      if (typeof s !== 'string' || s.length < 2) return s;
      if (Object.prototype.hasOwnProperty.call(dict.exact, s)) return dict.exact[s];

      for (var i = 0; i < rules.length; i++) {
        if (rules[i].re.test(s)) return s.replace(rules[i].re, rules[i].replace);
      }

      return s;
    }

    var logLines = [];
    var logFile = null;

    function logPath() {
      if (logFile) return logFile;

      try { logFile = path.join(electron.app.getPath('userData'), 'ru-shim.log'); }

      catch (e) { logFile = path.join(process.env.APPDATA || '.', 'Herd', 'ru-shim.log'); }

      return logFile;
    }

    function log(kind, en, ru) {
      logLines.push(kind + '\\t' + JSON.stringify(en) + (ru !== en ? '\\t-> ' + JSON.stringify(ru) : ''));
    }

    function flush() {
      try { if (logLines.length) { fs.appendFileSync(logPath(), logLines.join('\\n') + '\\n'); logLines = []; } } catch (e) {}
    }

    // маркер загрузки шима (файл перезаписывается на каждый запуск)
    try { fs.writeFileSync(logPath(), '=== ru-shim loaded ' + new Date().toISOString() + ' ===\\n'); } catch (e) {}

    function walkTemplate(node) {
      if (Array.isArray(node)) { node.forEach(walkTemplate); return; }
      if (!node || typeof node !== 'object') return;

      ['label', 'tooltip'].forEach(function (key) {
        var v = node[key];
        if (typeof v === 'string') {
          var ru = translate(v);
          log('menu', v, ru);
          if (ru !== v) node[key] = ru;
        }
      });

      if (node.submenu) walkTemplate(node.submenu);
    }

    var Menu = electron.Menu;
    if (Menu && typeof Menu.buildFromTemplate === 'function') {
      var origBuild = Menu.buildFromTemplate.bind(Menu);
      Menu.buildFromTemplate = function (tpl) {
        try { walkTemplate(tpl); } catch (e) {}
        flush();
        return origBuild(tpl);
      };
    }

    var dlg = electron.dialog;
    if (dlg) {
      ['showMessageBox', 'showMessageBoxSync'].forEach(function (name) {
        if (typeof dlg[name] !== 'function') return;

        var orig = dlg[name].bind(dlg);

        dlg[name] = function () {
          var args = Array.prototype.slice.call(arguments);

          try {
            var opts = (args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) ? args[0] : null;

            if (opts) {
              ['title', 'message', 'detail', 'checkboxLabel'].forEach(function (k) {
                if (typeof opts[k] === 'string') { var ru = translate(opts[k]); log('dialog', opts[k], ru); opts[k] = ru; }
              });

              if (Array.isArray(opts.buttons)) {
                opts.buttons = opts.buttons.map(function (b) { var ru = translate(b); log('dialog-btn', b, ru); return ru; });
              }
            }

            flush();
          } catch (e) {}

          return orig.apply(null, args);
        };
      });
    }

    var Notification = electron.Notification;
    if (Notification && typeof Notification === 'function') {
      var Original = Notification;

      function PatchedNotification() {
        var args = Array.prototype.slice.call(arguments);
        try {
          var opts = args[0];

          if (opts && typeof opts === 'object') {
            ['title', 'body'].forEach(function (k) {
              if (typeof opts[k] === 'string') { var ru = translate(opts[k]); log('notification', opts[k], ru); opts[k] = ru; }
            });
          }

          flush();
        } catch (e) {}

        return new (Function.prototype.bind.apply(Original, [null].concat(args)))();
      }

      try {
        Object.setPrototypeOf(PatchedNotification, Original);
        PatchedNotification.prototype = Original.prototype;
        electron.Notification = PatchedNotification;
      } catch (e) {}
    }

    // Заголовки окон: main-процесс задаёт их как опцию BrowserWindow ({title: name + " Logs"})
    // и через setTitle после загрузки страницы — перехватываем оба пути.
    var BW = electron.BrowserWindow;
    if (BW && typeof BW === 'function') {
      var origSetTitle = null;
      try { origSetTitle = BW.prototype.setTitle; } catch (e) {}

      if (typeof origSetTitle === 'function') {
        BW.prototype.setTitle = function (t) {
          try {
            if (typeof t === 'string') { var ru = translate(t); log('setTitle', t, ru); t = ru; }
          } catch (e) {}

          return origSetTitle.call(this, t);
        };
      }

      try {
        var OriginalBW = BW;
        function PatchedBrowserWindow() {
          var args = Array.prototype.slice.call(arguments);
          try {
            var opts = args[0];
            if (opts && typeof opts === 'object' && typeof opts.title === 'string') {
              var ru = translate(opts.title);
              log('window', opts.title, ru);
              opts.title = ru;
            }
          } catch (e) {}

          return new (Function.prototype.bind.apply(OriginalBW, [null].concat(args)))();
        }

        Object.setPrototypeOf(PatchedBrowserWindow, OriginalBW);
        PatchedBrowserWindow.prototype = OriginalBW.prototype;
        electron.BrowserWindow = PatchedBrowserWindow;
      } catch (e) {}
    }

    process.on('exit', function () {
      try { flush(); } catch (e) {}
    });
  } catch (e) { /* не мешаем запуску */ }
})();
`;

function installMainShim(mainDict) {
  if (!mainDict) return;

  fs.writeFileSync(SHIM_DICT, JSON.stringify(mainDict, null, 2));
  fs.writeFileSync(SHIM_JS, SHIM_SOURCE);

  let idx = fs.readFileSync(MAIN_INDEX, 'utf8');

  if (!idx.includes('ru-shim')) {
    idx = idx.replace(/^['"]use strict['"];?\s*/, '');
    idx =
      '"use strict";\nrequire("./ru-shim.js"); // Herd RU: перевод меню/диалогов/уведомлений\n' +
      idx;

    fs.writeFileSync(MAIN_INDEX, idx);

    log('Главный процесс: установлен рантайм-шим (ru-shim.js + ru-main-dict.json)');
  }
}

function translateFile(src, lookup, chunkName, stats) {
  const DQ = /"((?:[^"\\\n]|\\.)*)"/g;

  let out = src.replace(DQ, (full, content, offset) => {
    let val = lookup.exact.get(content);
    let key = content;
    let trimmed = false;

    if (!val) {
      const t = content.trim();
      if (t && t !== content) {
        val = lookup.trim.get(t);
        key = t;
        trimmed = true;
      }
    }

    if (!val) return full;
    if (!matchPattern(chunkName, val.files)) return full;

    // skipBefore: пропустить, если перед литералом стоит указанный контекст (защита openSettings("General"))
    if (val.skipBefore) {
      const before = src.slice(Math.max(0, offset - 40), offset);
      const markers = Array.isArray(val.skipBefore) ? val.skipBefore : [val.skipBefore];
      if (markers.some(mk => before.endsWith(mk))) return full;
    }

    const ru = trimmed ? content.replace(content.trim(), val.ru) : val.ru;

    stats.count(val.ru, chunkName);
    stats.usedKeys.add(key);

    return '"' + ru + '"';
  });

  // Статические сегменты template-литералов: `текст ${x} текст`
  const TPL = /`((?:[^`\\]|\\.)*)`/g;

  out = out.replace(TPL, (full, inner) => {
    const parts = inner.split(/(\$\{[^}]*\})/g);

    let changed = false;

    const mapped = parts.map(p => {
      if (p.startsWith('${')) return p;

      const val = lookup.exact.get(p);

      if (val && matchPattern(chunkName, val.files) && !val.skipBefore) {
        stats.count(val.ru, chunkName);
        stats.usedKeys.add(p);
        changed = true;

        return val.ru;
      }

      return p;
    });

    return changed ? '`' + mapped.join('') + '`' : full;
  });

  return out;
}

function cmdApply() {
  if (!fs.existsSync(WORK_APP)) die('нет work/app — сначала выполните: node patch.js extract');

  const lookup = buildLookup();
  const assetsDir = path.join(WORK_APP, 'out', 'renderer', 'assets');
  const rendererDir = path.join(WORK_APP, 'out', 'renderer');

  const stats = {
    total: 0,
    byKey: new Map(),
    usedKeys: new Set(),
    count(ru, file) {
      this.total++;
      if (!this.byKey.has(ru)) this.byKey.set(ru, new Set());
      this.byKey.get(ru).add(file);
    },
  };

  const changedFiles = [];

  let parseErrors = 0;

  // 1) JS-чанки рендерера
  for (const f of fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'))) {
    const p = path.join(assetsDir, f);
    const src = fs.readFileSync(p, 'utf8');
    const out = translateFile(src, lookup, f, stats);

    if (out !== src) {
      try {
        acorn.parse(out, { ecmaVersion: 'latest', sourceType: 'module' });
      } catch (e) {
        console.error(
          '  !! синтаксическая ошибка в ' + f + ' после замены — файл откачен: ' + e.message,
        );
        parseErrors++;
        continue;
      }

      fs.writeFileSync(p, out);

      changedFiles.push(f);
    }
  }

  // 2) Заголовки HTML-окон
  const titleChanges = [];
  for (const f of fs.readdirSync(rendererDir).filter(f => f.endsWith('.html'))) {
    const p = path.join(rendererDir, f);
    const src = fs.readFileSync(p, 'utf8');

    let out = src;
    for (const [en, ru] of Object.entries(lookup.titles)) {
      const re = new RegExp('(<title>)' + en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(</title>)');

      if (re.test(out)) {
        out = out.replace(re, '$1' + ru + '$2');
        titleChanges.push(f + ': ' + en + ' → ' + ru);
      }
    }

    if (out !== src) fs.writeFileSync(p, out);
  }

  // 3) valueFixes: исправления уже переведённых значений (например, грамматика)
  const valueFixes = Array.isArray(lookup.fixes) ? lookup.fixes : [];
  let fixCount = 0;

  if (valueFixes.length) {
    for (const f of fs.readdirSync(assetsDir).filter(f => f.endsWith('.js'))) {
      const p = path.join(assetsDir, f);
      const src = fs.readFileSync(p, 'utf8');
      let fixed = src;

      for (const fx of valueFixes) fixed = fixed.split(fx.from).join(fx.to);

      if (fixed !== src) {
        try {
          acorn.parse(fixed, { ecmaVersion: 'latest', sourceType: 'module' });
        } catch (e) {
          console.error('  !! valueFix: откат ' + f + ': ' + e.message);
          continue;
        }

        fs.writeFileSync(p, fixed);
        fixCount++;
      }
    }

    log('valueFixes применены в ' + fixCount + ' файлах');
  }

  // 4) Шим главного процесса (меню трея, диалоги, уведомления из байткода)
  installMainShim(lookup.main);

  // 4) Отчёт: использованные и неиспользованные ключи
  const allKeys = Object.keys(JSON.parse(fs.readFileSync(DICT_PATH, 'utf8')).translations);
  const unused = allKeys.filter(k => !stats.usedKeys.has(k));
  const report = {
    date: new Date().toISOString(),
    totalReplacements: stats.total,
    changedJsFiles: changedFiles,
    htmlTitles: titleChanges,
    replacedKeys: Object.fromEntries([...stats.byKey].map(([ru, files]) => [ru, [...files]])),
    unusedKeys: unused,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  log(
    'Заменено строк: ' +
      stats.total +
      ' в ' +
      changedFiles.length +
      ' JS-файлах, заголовков: ' +
      titleChanges.length,
  );

  if (parseErrors) log('Файлов откачено из-за ошибок разбора: ' + parseErrors);

  if (unused.length)
    log('Ключи словаря без совпадений (' + unused.length + '): ' + unused.join(', '));

  log('Полный отчёт: ' + REPORT_PATH);
}

async function cmdPack() {
  if (!fs.existsSync(WORK_APP)) die('нет work/app — сначала extract + apply');

  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  log('Собираю ' + BUILD_ASAR + ' (unpacked: ' + UNPACK_GLOB + ')...');

  await asar.createPackageWithOptions(WORK_APP, BUILD_ASAR, {
    unpack: UNPACK_GLOB,
    unpackDir: UNPACK_DIR_GLOB,
  });

  const upDir = BUILD_ASAR + '.unpacked';
  const nUp = fs.existsSync(upDir)
    ? (function count(dir) {
        let n = 0;

        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) n += count(path.join(dir, e.name));
          else n++;
        }

        return n;
      })(upDir)
    : 0;

  log(
    'Готово: ' +
      BUILD_ASAR +
      ' (' +
      (fs.statSync(BUILD_ASAR).size / 1048576).toFixed(1) +
      ' МБ), unpacked-файлов: ' +
      nUp,
  );

  if (nUp !== 180) log('  !! ожидалось 180 unpacked-файлов как в оригинале — проверьте glob');
}

function cmdInstall() {
  if (!fs.existsSync(BUILD_ASAR)) die('нет build/app.asar — сначала pack');

  stopHerd();

  const script = writeElevatedScript('install.cmd', [
    'copy /Y "' + BUILD_ASAR + '" "' + INSTALLED_ASAR + '" >> "%LOG%" 2>&1',
    'xcopy /E /I /Y "' +
      BUILD_ASAR +
      '.unpacked" "' +
      INSTALLED_ASAR +
      '.unpacked" >> "%LOG%" 2>&1',
  ]);

  try {
    execSync('copy /Y "' + BUILD_ASAR + '" "' + INSTALLED_ASAR + '"', {
      stdio: 'ignore',
      shell: 'cmd.exe',
    });

    execSync('xcopy /E /I /Y "' + BUILD_ASAR + '.unpacked" "' + INSTALLED_ASAR + '.unpacked"', {
      stdio: 'ignore',
      shell: 'cmd.exe',
    });

    log('Установлено (прав хватило без UAC).');
  } catch {
    log('Нужны права администратора — подтвердите UAC-запрос.');

    try {
      elevatedRun(script);
    } catch (e) {
      die(
        'операция не выполнена (UAC отклонён или ошибка повышения): ' +
          e.message.slice(0, 120) +
          '. Повторите команду.',
      );
    }
  }

  const ok = sha256(INSTALLED_ASAR) === sha256(BUILD_ASAR);

  if (!ok)
    die(
      'установка не подтвердилась: хэш установленный != собранный. Повторите install от имени администратора.',
    );

  log(
    'Установка подтверждена. Herd ' +
      herdVersionOf(INSTALLED_ASAR) +
      ', sha256 ' +
      sha256(INSTALLED_ASAR).slice(0, 16) +
      '...',
  );

  log('Запустите Herd и проверьте интерфейс: node patch.js launch');
}

function cmdRestore() {
  if (!fs.existsSync(BACKUP_ASAR)) die('нет backup/app.asar.orig');

  stopHerd();

  const script = writeElevatedScript('restore.cmd', [
    'copy /Y "' + BACKUP_ASAR + '" "' + INSTALLED_ASAR + '" >> "%LOG%" 2>&1',
  ]);

  try {
    execSync('copy /Y "' + BACKUP_ASAR + '" "' + INSTALLED_ASAR + '"', {
      stdio: 'ignore',
      shell: 'cmd.exe',
    });

    log('Восстановлено без UAC.');
  } catch {
    log('Нужны права администратора — подтвердите UAC-запрос.');

    try {
      elevatedRun(script);
    } catch (e) {
      die(
        'операция не выполнена (UAC отклонён или ошибка повышения): ' +
          e.message.slice(0, 120) +
          '. Повторите команду.',
      );
    }
  }
  
  const ok = sha256(INSTALLED_ASAR) === sha256(BACKUP_ASAR);

  if (!ok) die('восстановление не подтвердилось. Повторите restore от имени администратора.');

  log('Оригинальный app.asar возвращён (unpacked-файлы патч не менял).');
}

function cmdStatus() {
  log('Herd.exe запущен: ' + (isHerdRunning() ? 'да' : 'нет'));

  if (fs.existsSync(INSTALLED_ASAR)) {
    const s = sha256(INSTALLED_ASAR);
    const same = fs.existsSync(BACKUP_ASAR) && s === sha256(BACKUP_ASAR);
    const patched = fs.existsSync(BUILD_ASAR) && s === sha256(BUILD_ASAR);

    log(
      'Установлен: Herd ' +
        herdVersionOf(INSTALLED_ASAR) +
        ', sha256 ' +
        s.slice(0, 16) +
        '... => ' +
        (same ? 'ОРИГИНАЛ' : patched ? 'ПАТЧЕННЫЙ (наша сборка)' : 'ДРУГОЙ (обновление Herd?)'),
    );
  }

  if (fs.existsSync(BACKUP_ASAR))
    log('Бэкап: backup/app.asar.orig, sha256 ' + sha256(BACKUP_ASAR).slice(0, 16) + '...');

  if (fs.existsSync(BUILD_ASAR))
    log('Сборка: build/app.asar, sha256 ' + sha256(BUILD_ASAR).slice(0, 16) + '...');

  if (fs.existsSync(WORK_APP))
    log(
      'work/app: распакован' +
        (fs.existsSync(REPORT_PATH) ? ', отчёт apply: patches/apply-report.json' : ''),
    );
}

function cmdLaunch() {
  try {
    execSync('start "" "' + path.join(HERD_DIR, 'Herd.exe') + '"', {
      shell: 'cmd.exe',
      stdio: 'ignore',
    });
    
    log('Herd запущен.');
  } catch (e) {
    die('не удалось запустить: ' + e.message);
  }
}

/* ------------------------------ main ------------------------------ */
const cmd = process.argv[2] || 'status';
(
  ({
    extract: cmdExtract,
    apply: cmdApply,
    pack: cmdPack,
    install: cmdInstall,
    restore: cmdRestore,
    status: cmdStatus,
    launch: cmdLaunch,
  })[cmd] ||
  (() =>
    die(
      'неизвестная команда: ' +
        cmd +
        '\nКоманды: extract, apply, pack, install, restore, status, launch',
    ))
)();
