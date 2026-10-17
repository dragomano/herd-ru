'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildLookup, translateFile } = require('../patch');

function translate(source, translations, file = 'settings-AbCd1234.js', lookupOptions = null) {
  const stats = {
    usedKeys: new Set(),
    replacements: [],
    count(ru, chunk) {
      this.replacements.push({ ru, chunk });
    },
  };
  const lookup = buildLookup({ ...lookupOptions, translations });
  const output = translateFile(source, lookup, file, stats);
  return { output, stats };
}

test('translates exact literals without matching substrings or changing case', () => {
  const { output } = translate(
    'const labels = ["Add Site", "Add Sites", "add site", "Mail", "text-sm"];',
    { 'Add Site': 'Добавить сайт' },
  );
  assert.equal(
    output,
    'const labels = ["Добавить сайт", "Add Sites", "add site", "Mail", "text-sm"];',
  );
});

test('preserves leading and trailing whitespace', () => {
  const { output } = translate('const label = "  Add Site   ";', {
    'Add Site': 'Добавить сайт',
  });
  assert.equal(output, 'const label = "  Добавить сайт   ";');
});

test('prefers an exact dictionary entry over its trimmed fallback', () => {
  const { output } = translate('const labels = [" Open ", "Open", "  Open  "];', {
    ' Open ': ' Особый перевод ',
    Open: 'Открыть',
  });
  // Точная запись « Open » выигрывает для неё самой; для паддинговых вариантов
  // trim-fallback берёт точную запись «Open», а не паддинговую.
  assert.equal(output, 'const labels = [" Особый перевод ", "Открыть", "  Открыть  "];');
});

test('paddedOnly protects icon ligatures and translates padded UI labels', () => {
  const { output, stats } = translate('const labels = ["Next", " Next ", "Next "];', {
    Next: { ru: 'Далее', paddedOnly: true },
  });
  assert.equal(output, 'const labels = ["Next", " Далее ", "Далее "];');
  assert.deepEqual([...stats.usedKeys], ['Next']);
  assert.equal(stats.replacements.length, 2);
});

for (const [file, expected] of [
  ['settings-AbCd1234.js', '"Сбой"'],
  ['wizard.js', '"Сбой"'],
  ['vendor-settings-AbCd1234.js', '"Failed"'],
  ['settings-AbCd1234.js.map', '"Failed"'],
]) {
  test(`file restrictions match complete chunk names: ${file}`, () => {
    const { output } = translate(
      '"Failed"',
      { Failed: { ru: 'Сбой', files: ['settings-*.js', 'wizard.js'] } },
      file,
    );
    assert.equal(output, expected);
  });
}

test('file patterns escape regex punctuation', () => {
  const dictionary = { Failed: { ru: 'Сбой', files: ['settings[1].*.js'] } };
  assert.equal(translate('"Failed"', dictionary, 'settings[1].abc.js').output, '"Сбой"');
  assert.equal(translate('"Failed"', dictionary, 'settings1Xabc.js').output, '"Failed"');
});

test('an empty files list disables a translation', () => {
  const { output, stats } = translate('"Failed"', { Failed: { ru: 'Сбой', files: [] } });
  assert.equal(output, '"Failed"');
  assert.equal(stats.usedKeys.size, 0);
});

for (const skipBefore of ['openSettings(', ['openSettings(', 'selectTab(']]) {
  test(`skipBefore protects routing values (${typeof skipBefore})`, () => {
    const { output } = translate(
      'openSettings("General"); selectTab("General"); const label = "General";',
      { General: { ru: 'Общие', skipBefore } },
    );
    const tab = Array.isArray(skipBefore) ? 'General' : 'Общие';
    assert.equal(output, `openSettings("General"); selectTab("${tab}"); const label = "Общие";`);
  });
}

test('translates template segments while preserving interpolation expressions', () => {
  const { output, stats } = translate('const label = `Hello ${user.name}, ${count} sites`;', {
    'Hello ': 'Здравствуйте ',
    ', ': '; ',
    ' sites': ' сайтов',
  });
  assert.equal(output, 'const label = `Здравствуйте ${user.name}; ${count} сайтов`;');
  assert.deepEqual([...stats.usedKeys], ['Hello ', ', ', ' sites']);
  assert.equal(stats.replacements.length, 3);
});

test('template segments honor file restrictions and leave unknown segments intact', () => {
  const translations = { 'Hello ': { ru: 'Здравствуйте ', files: ['settings-*'] } };
  const source = '`Hello ${name} unknown`';
  assert.equal(translate(source, translations).output, '`Здравствуйте ${name} unknown`');
  assert.equal(translate(source, translations, 'vendor.js').output, source);
});

test('template segments do not bypass skipBefore or paddedOnly restrictions', () => {
  const source = '`General${tab}`; `Next${index}`';
  const { output } = translate(source, {
    General: { ru: 'Общие', skipBefore: 'openSettings(' },
    Next: { ru: 'Далее', paddedOnly: true },
  });
  assert.equal(output, source);
});

test('translates padded template segments via trimmed fallback', () => {
  const { output } = translate('`Are you sure you want to delete PHP version ${name}`;', {
    'Are you sure you want to delete PHP version ': 'Удалить версию PHP ',
  });
  assert.equal(output, '`Удалить версию PHP ${name}`;');
});

test('keeps identifier-like segments glued to interpolation intact', () => {
  const source = 'const mods = `${m}Key`;';
  assert.equal(translate(source, { Key: 'Ключ' }).output, source);
  assert.equal(translate('`Key`', { Key: 'Ключ' }).output, '`Ключ`');
});

test('translates text nodes inside createStaticVNode html, leaving attributes intact', () => {
  const { output, stats } = translate(
    'const node = createStaticVNode("<div title=\\"Settings\\">Settings</div>");',
    { Settings: 'Настройки' },
  );
  assert.equal(
    output,
    'const node = createStaticVNode("<div title=\\"Settings\\">Настройки</div>");',
  );
  assert.equal(stats.replacements.length, 1);
});

test('reports the dictionary key used for a padded replacement', () => {
  const { stats } = translate('const label = "  Add Site  ";', { 'Add Site': 'Добавить сайт' });
  assert.deepEqual([...stats.usedKeys], ['Add Site']);
});

test('preserves escaped sequences in literal replacements', () => {
  const english = String.raw`Say \"Hello\"`;
  const { output } = translate(String.raw`const label = "Say \"Hello\"";`, {
    [english]: String.raw`Скажи \"Привет\"`,
  });
  assert.equal(output, String.raw`const label = "Скажи \"Привет\"";`);
});

test('skips vendor chunks listed in skipChunks and honors custom skipChunks', () => {
  const source = '"General"; const mods = `${m}Key`;';
  const translations = { General: 'Общие', Key: 'Ключ' };
  const opts = { skipChunks: ['vendor*'] };
  assert.equal(translate(source, translations, 'vendor-runtime-dom.js', opts).output, source);
  assert.equal(
    translate(source, { ...translations }, 'runtime-dom.esm-bundler-AbCd1234.js').output,
    source,
  );
  assert.equal(
    translate(source, translations, 'app.js').output,
    '"Общие"; const mods = `${m}Key`;',
  );
  assert.equal(translate(source, translations, 'vendor-app.js', opts).output, source);
});

test('records only matching and permitted replacements', () => {
  const { stats } = translate('openSettings("General"); ["General", " General ", "Failed"];', {
    General: { ru: 'Общие', skipBefore: 'openSettings(' },
    Failed: { ru: 'Сбой', files: ['wizard-*'] },
  });
  assert.deepEqual([...stats.usedKeys], ['General']);
  assert.deepEqual(stats.replacements, [
    { ru: 'Общие', chunk: 'settings-AbCd1234.js' },
    { ru: 'Общие', chunk: 'settings-AbCd1234.js' },
  ]);
});
