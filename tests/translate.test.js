'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { buildLookup, translateFile } = require('../patch');

function translate(source, translations, file = 'settings-AbCd1234.js') {
  const stats = {
    usedKeys: new Set(),
    replacements: [],
    count(ru, chunk) {
      this.replacements.push({ ru, chunk });
    },
  };
  const output = translateFile(source, buildLookup({ translations }), file, stats);
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
  assert.equal(output, 'const labels = [" Особый перевод ", "Открыть", "   Особый перевод   "];');
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

test('preserves escaped sequences in literal replacements', () => {
  const english = String.raw`Say \"Hello\"`;
  const { output } = translate(String.raw`const label = "Say \"Hello\"";`, {
    [english]: String.raw`Скажи \"Привет\"`,
  });
  assert.equal(output, String.raw`const label = "Скажи \"Привет\"";`);
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
