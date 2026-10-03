const asar = require('@electron/asar');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const list = asar.listPackage(path.join(ROOT, 'build', 'app.asar'));
const norm = list.map(s => s.replace(/^[\\/]/, '').replace(/\\/g, '/'));
console.log('ru-shim.js в сборке:', norm.includes('out/main/ru-shim.js'));
console.log('ru-main-dict.json в сборке:', norm.includes('out/main/ru-main-dict.json'));

// синхронное извлечение трёх файлов вручную через raw header — проверим содержимое index.js
try {
  const verifyDir = path.join(ROOT, 'build', 'verify2');
  fs.rmSync(verifyDir, { recursive: true, force: true });
  asar.extractAll(path.join(ROOT, 'build', 'app.asar'), verifyDir);
  console.log('index.js из сборки:', JSON.stringify(fs.readFileSync(path.join(verifyDir, 'out', 'main', 'index.js'), 'utf8')));
  const shim = fs.readFileSync(path.join(verifyDir, 'out', 'main', 'ru-shim.js'), 'utf8');
  console.log(' shim длина:', shim.length, '| начинается с:', JSON.stringify(shim.slice(0, 40)));
} catch (e) {
  console.log('extractAll ERR:', e.message.slice(0, 400));
}
