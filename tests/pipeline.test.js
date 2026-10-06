'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const asar = require('@electron/asar');
const { cmdApply, cmdPack } = require('../patch');
const { createFixture } = require('./helpers/fixture');

test('apply translates JS and HTML, applies value fixes, and writes a report', t => {
  const fixture = createFixture(t, {
    translations: {
      'Add Site': { ru: 'Добавить сайт', files: ['settings-*'] },
      General: { ru: 'Общие', skipBefore: 'openSettings(' },
      Next: { ru: 'Далее', paddedOnly: true },
      Unused: 'Не используется',
    },
    htmlTitles: { 'Herd (Settings)': 'Herd — настройки' },
    valueFixes: [{ from: 'Старый перевод', to: 'Новый перевод' }],
  });
  fixture.write(
    'out/renderer/assets/settings-abcd1234.js',
    'openSettings("General"); const labels = ["Add Site", "Next", " Next ", "Старый перевод"];',
  );
  fixture.write('out/renderer/assets/vendor.js', 'const label = "Add Site";');
  fixture.write('out/renderer/settings.html', '<html><title>Herd (Settings)</title></html>');
  fixture.write('out/renderer/other.html', '<title>Herd XSettingsX</title>');

  cmdApply(fixture);

  assert.equal(
    fixture.read('out/renderer/assets/settings-abcd1234.js'),
    'openSettings("General"); const labels = ["Добавить сайт", "Next", " Далее ", "Новый перевод"];',
  );
  assert.equal(fixture.read('out/renderer/assets/vendor.js'), 'const label = "Add Site";');
  assert.equal(
    fixture.read('out/renderer/settings.html'),
    '<html><title>Herd — настройки</title></html>',
  );
  assert.equal(fixture.read('out/renderer/other.html'), '<title>Herd XSettingsX</title>');
  const report = fixture.report();
  assert.equal(report.totalReplacements, 2);
  assert.deepEqual(report.changedJsFiles, ['settings-abcd1234.js']);
  assert.deepEqual(report.unusedKeys, ['General', 'Unused']);
  assert.deepEqual(report.replacedKeys, {
    'Добавить сайт': ['settings-abcd1234.js'],
    Далее: ['settings-abcd1234.js'],
  });
  assert.deepEqual(report.htmlTitles, ['settings.html: Herd (Settings) → Herd — настройки']);
  assert.equal(fs.existsSync(path.join(fixture.workApp, 'out/main/ru-shim.js')), false);
});

test('apply preserves an invalidly translated file and continues with valid chunks', t => {
  const errors = t.mock.method(console, 'error', () => {});
  const fixture = createFixture(t, {
    translations: { Broken: 'Неверная "строка"', Good: 'Верно' },
  });
  const original = 'const label = "Broken";';
  fixture.write('out/renderer/assets/broken.js', original);
  fixture.write('out/renderer/assets/good.js', 'const label = "Good";');

  cmdApply(fixture);

  assert.equal(fixture.read('out/renderer/assets/broken.js'), original);
  assert.equal(fixture.read('out/renderer/assets/good.js'), 'const label = "Верно";');
  assert.deepEqual(fixture.report().changedJsFiles, ['good.js']);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(errors.mock.calls[0].arguments[0], /синтаксическая ошибка в broken\.js/);
});

test('apply preserves the original file when a value fix breaks syntax', t => {
  const errors = t.mock.method(console, 'error', () => {});
  const fixture = createFixture(t, {
    translations: {},
    valueFixes: [{ from: 'Привет', to: 'Неверная "строка"' }],
  });
  const original = 'const label = "Привет";';
  fixture.write('out/renderer/assets/settings.js', original);

  cmdApply(fixture);

  assert.equal(fixture.read('out/renderer/assets/settings.js'), original);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(errors.mock.calls[0].arguments[0], /valueFix: откат settings\.js/);
});

test('repeated apply installs the shim once and leaves translated files unchanged', t => {
  const mainProcess = { exact: { Open: 'Открыть' }, rules: [] };
  const fixture = createFixture(t, {
    translations: { Open: 'Открыть' },
    mainProcess,
  });
  fixture.write('out/renderer/assets/settings.js', 'const label = "Open";');
  cmdApply(fixture);
  const mainIndex = fixture.read('out/main/index.js');
  const shim = fixture.read('out/main/ru-shim.js');

  cmdApply(fixture);

  assert.equal(fixture.read('out/main/index.js'), mainIndex);
  assert.equal(mainIndex.match(/require\("\.\/ru-shim\.js"\)/g).length, 1);
  assert.match(mainIndex, /module\.exports = \{ fixture: true \}/);
  assert.equal(fixture.read('out/main/ru-shim.js'), shim);
  assert.deepEqual(JSON.parse(fixture.read('out/main/ru-main-dict.json')), mainProcess);
  assert.equal(fixture.read('out/renderer/assets/settings.js'), 'const label = "Открыть";');
  assert.equal(fixture.report().totalReplacements, 0);
});

test('apply and pack preserve shim files and unpacked resources, including dotfiles', async t => {
  const fixture = createFixture(t, {
    translations: { Open: 'Открыть' },
    mainProcess: { exact: { Open: 'Открыть' }, rules: [] },
  });
  fixture.write('package.json', JSON.stringify({ name: 'herd-ru-fixture', version: '0.0.0' }));
  fixture.write('out/renderer/assets/settings.js', 'const label = "Open";');
  const unpacked = [
    'resources/bin/tool.txt',
    'resources/config/nginx/temp/.ignore',
    'resources/valet/cli/.rnd',
    'resources/logo.png',
  ];
  const packed = ['resources/other/readme.txt', 'resources/other/nested.png'];
  const content = Buffer.from([0, 1, 254, 255]);
  for (const file of [...unpacked, ...packed]) fixture.write(file, content);

  cmdApply(fixture);
  await cmdPack(fixture);

  const archive = path.join(fixture.buildDir, 'app.asar');
  const readArchive = file => asar.extractFile(archive, path.normalize(file));
  assert.equal(
    readArchive('out/renderer/assets/settings.js').toString(),
    'const label = "Открыть";',
  );
  assert.match(readArchive('out/main/index.js').toString(), /require\("\.\/ru-shim\.js"\)/);
  for (const file of ['out/main/ru-shim.js', 'out/main/ru-main-dict.json']) {
    assert.equal(readArchive(file).toString(), fixture.read(file));
  }
  for (const file of unpacked) {
    assert.equal(asar.statFile(archive, path.normalize(file)).unpacked, true, file);
    assert.deepEqual(fs.readFileSync(path.join(archive + '.unpacked', file)), content, file);
  }
  for (const file of packed) {
    assert.ok(!asar.statFile(archive, path.normalize(file)).unpacked, file);
    assert.deepEqual(readArchive(file), content, file);
  }
  const extracted = path.join(fixture.root, 'extracted');
  asar.extractAll(archive, extracted);
  for (const file of unpacked) {
    assert.deepEqual(fs.readFileSync(path.join(extracted, file)), content, file);
  }
});

test('requiring the patcher does not execute a CLI command', t => {
  const fixture = createFixture(t);
  const result = spawnSync(
    process.execPath,
    ['-e', 'require(process.argv[1]);', require.resolve('../patch'), 'unknown-command'],
    { cwd: fixture.root, encoding: 'utf8', timeout: 10000 },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.equal(fs.existsSync(fixture.reportPath), false);
});

test('the CLI still rejects unknown commands with a nonzero exit code', t => {
  const fixture = createFixture(t);
  const result = spawnSync(process.execPath, [require.resolve('../patch'), 'unknown-command'], {
    cwd: fixture.root,
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /неизвестная команда: unknown-command/);
});
