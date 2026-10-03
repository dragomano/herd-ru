const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'work', 'app', 'out', 'renderer', 'assets');
const lv = fs.readFileSync(path.join(ASSETS, 'logViewer-BrSr5sJI.js'), 'utf8');
const TPL = /`((?:[^`\\]|\\.)*)`/g;
let m;
while ((m = TPL.exec(lv))) {
  const t = m[1];
  if (/[A-Za-z]{3}/.test(t) && t.length < 120 && !/https?:/.test(t)) {
    console.log('LV TPL: `' + t.replace(/\n/g, '|') + '`');
  }
}
const ml = fs.readFileSync(path.join(ASSETS, 'mails-Dx57pwho.js'), 'utf8');
let i = ml.indexOf('Remove ');
while (i !== -1) {
  const seg = ml.slice(Math.max(0, i - 90), i + 110).replace(/\n/g, '|');
  if (/createTextVNode|createBaseVNode/.test(seg)) console.log('MAILS: ...' + seg + '...');
  i = ml.indexOf('Remove ', i + 7);
}
const st = fs.readFileSync(path.join(ASSETS, 'settings-DBHSboFi.js'), 'utf8');
i = st.indexOf('" With "');
console.log('WITH CTX: ' + st.slice(i + 10, i + 700).replace(/\n/g, '|'));
