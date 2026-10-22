'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const asar = require('@electron/asar');
const {
  herdVersionOf,
  isPatchedAsar,
  pickExtractSource,
  refreshOriginalBackup,
  restoreConflict,
} = require('../patch');

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'herd-ru-backup-'));
  const stage = path.join(root, 'stage');

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  t.mock.method(console, 'log', () => {});

  // Имена совпадают с параметрами refreshOriginalBackup: иначе функция возьмёт
  // реальные пути установленного Herd и бэкапа проекта.
  const paths = {
    installedAsar: path.join(root, 'installed', 'app.asar'),
    buildAsar: path.join(root, 'build', 'app.asar'),
    backupAsar: path.join(root, 'backup', 'app.asar.orig'),
    infoPath: path.join(root, 'backup', 'INFO.txt'),
  };

  for (const value of Object.values(paths)) {
    assert.ok(value.startsWith(root + path.sep), 'путь вне временного каталога: ' + value);
  }

  async function pack(file, { version = '9.9.9', shim = false } = {}) {
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(path.join(stage, 'out', 'main'), { recursive: true });
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'herd', version }));
    if (shim) fs.writeFileSync(path.join(stage, 'out', 'main', 'ru-shim.js'), '// перевод меню\n');

    fs.mkdirSync(path.dirname(file), { recursive: true });
    await asar.createPackage(stage, file);
  }

  return {
    root,
    paths,
    pack,
    run: options => refreshOriginalBackup({ ...paths, ...options }),
    pick: () => pickExtractSource(paths),
  };
}

test('refreshOriginalBackup snapshots the original, verifies SHA256, and writes INFO.txt', async t => {
  const { paths, pack, run } = setup(t);
  await pack(paths.installedAsar);

  assert.equal(await run(), 'created');
  assert.equal(sha256(paths.backupAsar), sha256(paths.installedAsar));

  const info = fs.readFileSync(paths.infoPath, 'utf8');
  assert.match(info, /Herd version: 9\.9\.9\r?\n/);
  assert.match(info, new RegExp('Hash: ' + sha256(paths.installedAsar)));
  assert.match(info, /Algorithm: SHA256/);
  assert.ok(!fs.existsSync(paths.backupAsar + '.tmp'), 'временный файл копии удалён');
});

test('a repeated call finds the backup up to date and leaves it untouched', async t => {
  const { paths, pack, run } = setup(t);
  await pack(paths.installedAsar);
  await run();

  fs.writeFileSync(paths.infoPath, 'метка');

  assert.equal(await run(), 'same');
  assert.equal(fs.readFileSync(paths.infoPath, 'utf8'), 'метка');
});

test('a patched installed archive never overwrites the original backup', async t => {
  const { paths, pack, run } = setup(t);
  await pack(paths.installedAsar, { shim: true });
  fs.mkdirSync(path.dirname(paths.backupAsar), { recursive: true });
  fs.writeFileSync(paths.backupAsar, 'оригинал 2.0.1');
  fs.writeFileSync(paths.infoPath, 'старый снимок');

  assert.equal(await run(), 'ours');
  assert.equal(fs.readFileSync(paths.backupAsar, 'utf8'), 'оригинал 2.0.1');
  assert.equal(fs.readFileSync(paths.infoPath, 'utf8'), 'старый снимок');
});

test('force snapshots even a patched archive', async t => {
  const { paths, pack, run } = setup(t);
  await pack(paths.installedAsar, { shim: true });
  fs.mkdirSync(path.dirname(paths.backupAsar), { recursive: true });
  fs.writeFileSync(paths.backupAsar, 'прежний снимок');

  assert.equal(await run({ force: true }), 'created');
  assert.equal(sha256(paths.backupAsar), sha256(paths.installedAsar));
});

test('an archive matching build/app.asar counts as our build', async t => {
  const { paths, pack, run } = setup(t);
  await pack(paths.installedAsar);
  fs.mkdirSync(path.dirname(paths.buildAsar), { recursive: true });
  fs.copyFileSync(paths.installedAsar, paths.buildAsar);

  assert.equal(isPatchedAsar(paths.installedAsar), false);
  assert.equal(await run(), 'ours');
  assert.ok(!fs.existsSync(paths.backupAsar));
});

test('no snapshot is taken without an installed archive', async t => {
  const { run } = setup(t);

  assert.equal(await run(), 'missing');
});

test('an unreadable archive never becomes a backup', async t => {
  const { paths, run } = setup(t);
  fs.mkdirSync(path.dirname(paths.installedAsar), { recursive: true });
  fs.writeFileSync(paths.installedAsar, 'не архив');

  assert.equal(await run(), 'unknown');
  assert.ok(!fs.existsSync(paths.backupAsar));
});

test('isPatchedAsar tells the original from our build', async t => {
  const { paths, pack } = setup(t);
  await pack(paths.installedAsar);
  await pack(paths.buildAsar, { shim: true });

  assert.equal(isPatchedAsar(paths.installedAsar), false);
  assert.equal(isPatchedAsar(paths.buildAsar), true);
});

test('restoreConflict warns only about a version change', () => {
  assert.equal(restoreConflict('2.0.3', '2.0.1'), true);
  assert.equal(restoreConflict('2.0.3', '2.0.3'), false);
  assert.equal(restoreConflict(null, '2.0.1'), false);
  assert.equal(restoreConflict('2.0.3', null), false);
  assert.equal(restoreConflict('?', '2.0.1'), false);
  assert.equal(restoreConflict('2.0.3', '?'), false);
});

test('pickExtractSource unpacks the backup original when our build is installed', async t => {
  const { paths, pack, pick } = setup(t);
  await pack(paths.installedAsar, { version: '2.0.3', shim: true });
  await pack(paths.backupAsar, { version: '2.0.3' });

  const source = pick();

  assert.equal(source.file, paths.backupAsar);
  assert.match(source.why, /уже наша сборка/);
});

test('pickExtractSource keeps the installed archive when it is the original', async t => {
  const { paths, pack, pick } = setup(t);
  await pack(paths.installedAsar, { version: '2.0.3' });
  await pack(paths.backupAsar, { version: '2.0.1' });

  assert.deepEqual(pick(), { file: paths.installedAsar, why: null });
});

test('pickExtractSource never mixes versions or uses a patched backup', async t => {
  const mismatched = setup(t);
  await mismatched.pack(mismatched.paths.installedAsar, { version: '2.0.3', shim: true });
  await mismatched.pack(mismatched.paths.backupAsar, { version: '2.0.1' });
  assert.equal(mismatched.pick().file, mismatched.paths.installedAsar);

  const patchedBackup = setup(t);
  await patchedBackup.pack(patchedBackup.paths.installedAsar, { version: '2.0.3', shim: true });
  await patchedBackup.pack(patchedBackup.paths.backupAsar, { version: '2.0.3', shim: true });
  assert.equal(patchedBackup.pick().file, patchedBackup.paths.installedAsar);
});

test('pickExtractSource falls back to the backup alone or to nothing', async t => {
  const { paths, pack, pick } = setup(t);
  await pack(paths.backupAsar, { version: '2.0.3' });

  assert.equal(pick().file, paths.backupAsar);

  const empty = setup(t);
  assert.equal(empty.pick(), null);
});

test('herdVersionOf reads the version from a replaced archive', async t => {
  const { paths, pack } = setup(t);

  await pack(paths.installedAsar, { version: '1.0.0' });
  assert.equal(herdVersionOf(paths.installedAsar), '1.0.0');

  // install заменяет файл в том же процессе: кеш заголовка не должен мешать
  await pack(paths.installedAsar, { version: '2.0.3' });
  assert.equal(herdVersionOf(paths.installedAsar), '2.0.3');

  fs.writeFileSync(paths.installedAsar, 'не архив');
  assert.equal(herdVersionOf(paths.installedAsar), '?');
});
