'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { cmdApply, syncStudioWidgetFromInstalled } = require('../patch');
const { readZip, writeZip } = require('../patches/zip');
const { createFixture } = require('./helpers/fixture');

const STUDIO_ZIP = path.join('resources', 'bin', 'herd-ai-widget.zip');

function writeStudioZip(fixture, entries) {
  const target = path.join(fixture.workApp, STUDIO_ZIP);

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, writeZip(entries));
}

function readStudioZip(fixture) {
  const archive = readZip(fs.readFileSync(path.join(fixture.workApp, STUDIO_ZIP)));
  return Object.fromEntries(archive.entries.map(e => [e.name, e.data.toString('utf8')]));
}

test('apply translates only the studio main bundle and reports studio stats', t => {
  const fixture = createFixture(t, {
    translations: {},
    studio: {
      Preview: 'Предпросмотр',
      More: 'Ещё',
      'Select element': 'Выбрать элемент',
      'Close studio and return to the site': 'Закрыть студию и вернуться на сайт',
      Changes: 'Изменения',
    },
  });
  const main = [
    'const tabs = [{ id: "preview", label: "Preview" }, { id: "more", label: "More" }];',
    'const picker = { "data-tooltip": "Select element", "aria-label": "Select element" };',
    'const close = "Close studio and return to the site";',
  ].join('\n');
  const vendor = 'const label = "Preview";';

  writeStudioZip(fixture, [
    { name: 'main-AAAA1111.js', data: Buffer.from(main) },
    { name: 'vendor-AAAA1111.js', data: Buffer.from(vendor) },
    { name: 'version.json', data: Buffer.from('{"version":"1.0.2"}') },
  ]);

  cmdApply(fixture);

  const files = readStudioZip(fixture);
  const mainKey = Object.keys(files).find(k => /^main-/.test(k));
  assert.ok(mainKey, 'главный бандл переименован по хэшу содержимого');
  assert.match(files[mainKey], /label: "Предпросмотр"/);
  assert.match(files[mainKey], /label: "Ещё"/);
  assert.match(files[mainKey], /"data-tooltip": "Выбрать элемент"/);
  assert.match(files[mainKey], /"aria-label": "Выбрать элемент"/);
  assert.match(files[mainKey], /"Закрыть студию и вернуться на сайт"/);
  assert.equal(files['vendor-AAAA1111.js'], vendor);
  assert.equal(files['version.json'], '{"version":"1.0.2"}');

  assert.deepEqual(fixture.report().studio, {
    totalReplacements: 5,
    changedFiles: [mainKey],
    unusedKeys: ['Changes'],
  });
});

test('repeated apply leaves the studio bundle unchanged', t => {
  const fixture = createFixture(t, {
    translations: {},
    studio: { Preview: 'Предпросмотр' },
  });

  writeStudioZip(fixture, [
    { name: 'main-AAAA1111.js', data: Buffer.from('const label = "Preview";') },
  ]);

  cmdApply(fixture);
  const first = readStudioZip(fixture);
  const firstKey = Object.keys(first).find(k => /^main-/.test(k));

  cmdApply(fixture);

  const second = readStudioZip(fixture);
  const secondKey = Object.keys(second).find(k => /^main-/.test(k));
  assert.equal(secondKey, firstKey, 'имя главного бандла стабильно между запусками');
  assert.equal(second[secondKey], first[firstKey]);
  assert.equal(first[firstKey], 'const label = "Предпросмотр";');
  assert.equal(fixture.report().studio.totalReplacements, 0);
  assert.deepEqual(fixture.report().studio.changedFiles, []);
});

test('apply preserves the studio bundle when a translation breaks syntax', t => {
  const errors = t.mock.method(console, 'error', () => {});
  const fixture = createFixture(t, {
    translations: {},
    studio: { Preview: 'сломанная "кавычка' },
  });
  const original = 'const label = "Preview";';

  writeStudioZip(fixture, [{ name: 'main-AAAA1111.js', data: Buffer.from(original) }]);

  cmdApply(fixture);

  assert.equal(readStudioZip(fixture)['main-AAAA1111.js'], original);
  assert.deepEqual(fixture.report().studio.changedFiles, []);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(errors.mock.calls[0].arguments[0], /синтаксическая ошибка в main-AAAA1111\.js/);
});

test('extract prefers the newer installed studio widget over the stale backup copy', t => {
  const fixture = createFixture(t);
  const installedAsar = path.join(fixture.root, 'installed', 'app.asar');
  const installedZip = path.join(
    fixture.root,
    'installed',
    'app.asar.unpacked',
    'resources',
    'bin',
    'herd-ai-widget.zip',
  );
  const workZip = path.join(fixture.workApp, STUDIO_ZIP);

  const makeZip = (version, builtAt, bundle) =>
    writeZip([
      { name: 'version.json', data: Buffer.from(JSON.stringify({ version, builtAt })) },
      { name: 'main-AAAA1111.js', data: Buffer.from(bundle) },
    ]);

  fs.mkdirSync(path.dirname(installedZip), { recursive: true });
  fs.mkdirSync(path.dirname(workZip), { recursive: true });
  fs.writeFileSync(installedZip, makeZip('1.0.2', '2026-10-15T11:58:20.308Z', 'new'));
  fs.writeFileSync(workZip, makeZip('1.0.1', '2026-10-01T00:00:00.000Z', 'old'));

  const sync = () => syncStudioWidgetFromInstalled({ workApp: fixture.workApp, installedAsar });

  assert.equal(sync(), true);
  assert.deepEqual(fs.readFileSync(workZip), fs.readFileSync(installedZip));
  assert.equal(sync(), false, 'повторная синхронизация не нужна');
});
