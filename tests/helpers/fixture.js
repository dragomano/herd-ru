'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function createFixture(t, dictionary = { translations: {} }) {
  const tempDir = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(tempDir, 'herd-ru-test-'));

  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), tempDir);
    assert.ok(path.basename(root).startsWith('herd-ru-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  t.mock.method(console, 'log', () => {});

  const workApp = path.join(root, 'work', 'app');
  const dictPath = path.join(root, 'dict', 'ru.json');
  const reportPath = path.join(root, 'patches', 'apply-report.json');
  const buildDir = path.join(root, 'build');

  function write(file, content) {
    const target = path.join(workApp, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  fs.mkdirSync(path.dirname(dictPath), { recursive: true });
  fs.writeFileSync(dictPath, JSON.stringify(dictionary));
  fs.mkdirSync(path.join(workApp, 'out', 'renderer', 'assets'), { recursive: true });
  write('out/main/index.js', '"use strict";\nmodule.exports = { fixture: true };\n');

  return {
    root,
    workApp,
    dictPath,
    reportPath,
    buildDir,
    write,
    read: file => fs.readFileSync(path.join(workApp, file), 'utf8'),
    report: () => JSON.parse(fs.readFileSync(reportPath, 'utf8')),
  };
}

module.exports = { createFixture };
