'use strict';

// Печатаемые строки из V8-байткода главного процесса (out/main/index.jsc).
// Строки хранятся как ASCII (Latin-1, 1 байт) и UTF-16LE — проверяются оба
// выравнивания, поэтому одна и та же константа может дать дубликаты: их снимает Set.
// Модуль общий для patches/scan-bytecode.js и режима unused анализатора строк.

const fs = require('fs');

function extractStrings(buf) {
  const out = new Set();
  let cur = '';

  for (const c of buf) {
    if (c >= 32 && c < 127) cur += String.fromCharCode(c);
    else {
      if (cur.length >= 3) out.add(cur);
      cur = '';
    }
  }

  if (cur.length >= 3) out.add(cur);

  for (let align = 0; align < 2; align++) {
    cur = '';

    for (let i = align; i < buf.length - 1; i += 2) {
      const c = buf[i] | (buf[i + 1] << 8);

      if (c >= 32 && c < 127) cur += String.fromCharCode(c);
      else {
        if (cur.length >= 3) out.add(cur);
        cur = '';
      }
    }
  }

  return out;
}

function readBytecodeStrings(file) {
  return fs.existsSync(file) ? extractStrings(fs.readFileSync(file)) : new Set();
}

module.exports = { extractStrings, readBytecodeStrings };
