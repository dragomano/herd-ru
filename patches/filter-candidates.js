// Filter candidates to those appearing in app-owned chunks (not vue runtime/libs)
const fs = require('fs');
const path = require('path');
const cands = JSON.parse(fs.readFileSync(path.join(__dirname, 'candidates.json'), 'utf8'));

const APP_CHUNKS = [
  'settings-DBHSboFi.js', 'services-Q6pzQvL4.js', 'menubar-pLGWZsQB.js',
  'siteWizard-CTgdLgX3.js', 'onboarding-29j6javl.js', 'logs-Dg2q5Qrb.js',
  'dumps-BjE4DOfj.js', 'mails-Dx57pwho.js', 'linkRemoteSite-DSL5WLzN.js',
  'logViewer-BrSr5sJI.js', 'upToDate-DFDlFzs3.js', 'updater-DFRjLefK.js',
  'Forge-CrhPKCNV.js', 'Box.vue_vue_type_script_setup_true_lang-D9Md5jy9.js',
  'Divider.vue_vue_type_script_setup_true_lang-BNYO3fzj.js',
  'LightButton-DhabasU2.js', 'Loading-CQye4Jy3.js',
  'OnboardingButton.vue_vue_type_script_setup_true_lang-CKc6QMbV.js',
  'UiCheckbox.vue_vue_type_script_setup_true_lang-DrHY_t04.js',
  'UiInput.vue_vue_type_script_setup_true_lang-CU0YYWxb.js',
  'helper-rqO8ojNt.js', 'icon-Hqenk61d.js', 'module-Dfk6nJ6B.js',
];

// library noise we never want to translate
const NOISE = new Set([
  'Before Christ', 'Anno Domini', 'Animation Start', 'Animation End', 'Animation Iteration',
  'Visibility change', 'Window resize', 'Auto Resize disabled', 'Disconnect body MutationObserver',
  'Attach listeners to', 'Arguments', 'Array', 'Aptabase: Failed to send event',
  'Aptabase: to track events in the main process you must import \'trackEvent\' from \'@aptabase/electron/main\'.',
  'Added missing iframe ID: ', 'Close iframe cancelled by onClose event',
  'Checking connection is from allowed list of origins: ', 'Checking connection is from: ',
  'Deprecated: \'', 'Deprecation warning: ',
]);

const out = cands.filter(c => {
  if (!c.files.some(f => APP_CHUNKS.includes(f))) return false;
  if (NOISE.has(c.s)) return false;
  return true;
}).sort((a, b) => a.s.localeCompare(b.s));

fs.writeFileSync(path.join(__dirname, 'ui-candidates.txt'),
  out.map(c => `${c.count}\t${c.files.join(',').replace(/\.vue_vue_type_script_setup_true_lang/g, '*').replace(/-[A-Za-z0-9_-]{8}\.js/, '')}\t${c.s}`).join('\n'));
console.log('ui candidates:', out.length);
