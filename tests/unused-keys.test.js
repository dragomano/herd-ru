'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyUnused } = require('../patches/analyze-strings');

function texts(entries) {
  const map = new Map();

  for (const [value, kind, files] of entries)
    map.set(value, { kind, count: 1, files: new Set(files) });

  return map;
}

test('classifies keys into actions and keeps the check order', () => {
  const buckets = classifyUnused(
    ['On Page', ' Padded ', 'Shim Word', 'Shim Rule', 'Main Word', 'Dead Key'],
    {
      texts: texts([
        ['On Page', 'literal', ['settings-AbCd1234.js']],
        ['Padded', 'literal', ['dumps-AbCd1234.js']],
      ]),
      bytecode: new Set(['Shim Word', 'Main Word', 'Herd Logs']),
      shimExact: new Set(['Shim Word']),
      shimRules: [{ match: '^Herd (.+)$', replace: 'Herd $1' }, { match: '^Shim Rule$' }],
    },
  );

  assert.deepEqual(buckets.onPage, [{ key: 'On Page', kind: 'literal', files: ['settings'] }]);
  assert.deepEqual(buckets.padding, [
    { key: ' Padded ', found: 'Padded', kind: 'literal', files: ['dumps'] },
  ]);
  assert.deepEqual(buckets.shimCovered, [{ key: 'Shim Word', found: 'Shim Word' }]);
  assert.deepEqual(buckets.mainProcess, [{ key: 'Main Word', found: 'Main Word' }]);
  assert.deepEqual(buckets.dead, [
    { key: 'Shim Rule', inside: null },
    { key: 'Dead Key', inside: null },
  ]);
});

test('a padded key matches unpadded text and is not reported dead', () => {
  const buckets = classifyUnused([' Fallback '], {
    texts: texts([['Fallback', 'template', ['onboarding-AbCd1234.js']]]),
    bytecode: new Set(),
    shimExact: new Set(),
  });

  assert.equal(buckets.padding.length, 1);
  assert.equal(buckets.padding[0].kind, 'template');
  assert.deepEqual(buckets.dead, []);
});

test('an exact chunk match takes priority over a bytecode string', () => {
  const buckets = classifyUnused(['Both'], {
    texts: texts([['Both', 'literal', ['mails-AbCd1234.js']]]),
    bytecode: new Set(['Both']),
    shimExact: new Set(),
  });

  assert.equal(buckets.onPage.length, 1);
  assert.deepEqual(buckets.mainProcess, []);
});

test('a dead key records the bytecode string that contains it', () => {
  const buckets = classifyUnused(['Version: '], {
    texts: new Map(),
    bytecode: new Set(['Herd Version: 2.0.3']),
    shimExact: new Set(),
  });

  assert.deepEqual(buckets.dead, [{ key: 'Version: ', inside: 'Herd Version: 2.0.3' }]);
});
