'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { cmdApply } = require('../patch');
const { createFixture } = require('./helpers/fixture');

function loadShim(t, apis, { failLogging = false } = {}) {
  const mainProcess = {
    exact: { Open: 'Открыть', Quit: 'Выйти', Cancel: 'Отмена', 'Project Logs': 'Точный перевод' },
    rules: [{ match: '^(.*) Logs$', replace: '$1 — логи' }],
  };
  const fixture = createFixture(t, { translations: {}, mainProcess });
  cmdApply(fixture);
  const electron = { app: { getPath: () => fixture.root }, ...apis };
  const writeLog = t.mock.fn(() => {
    if (failLogging) throw new Error('Log is unavailable');
  });
  const modules = {
    electron,
    fs: { writeFileSync: writeLog, appendFileSync: writeLog },
    path,
    './ru-main-dict.json': mainProcess,
  };
  vm.runInNewContext(
    fixture.read('out/main/ru-shim.js'),
    {
      require(name) {
        assert.ok(Object.hasOwn(modules, name), `Unexpected shim dependency: ${name}`);
        return modules[name];
      },
      process: { env: {}, on: t.mock.fn() },
    },
    { filename: 'ru-shim.js', timeout: 1000 },
  );
  return { electron, writeLog };
}

test('shim translates nested menus without changing callbacks, ids, or return values', t => {
  const result = { menu: true };
  const build = t.mock.fn(() => result);
  const { electron } = loadShim(t, { Menu: { buildFromTemplate: build } });
  const click = () => {};
  const template = [
    { label: 'Open', tooltip: 'Open', submenu: [{ label: 'Quit', id: 'Open', click }] },
  ];

  assert.equal(electron.Menu.buildFromTemplate(template), result);
  assert.equal(template[0].label, 'Открыть');
  assert.equal(template[0].tooltip, 'Открыть');
  assert.equal(template[0].submenu[0].label, 'Выйти');
  assert.equal(template[0].submenu[0].id, 'Open');
  assert.equal(template[0].submenu[0].click, click);
  assert.equal(build.mock.calls[0].arguments[0], template);
  assert.equal(build.mock.calls[0].this, electron.Menu);
});

test('shim prioritizes exact entries over regex rules and preserves unknown values', t => {
  const { electron } = loadShim(t, { Menu: { buildFromTemplate: template => template } });
  const template = [{ label: 'Project Logs' }, { label: 'Demo Logs' }, { label: 'Unknown' }];

  electron.Menu.buildFromTemplate(template);

  assert.deepEqual(
    template.map(item => item.label),
    ['Точный перевод', 'Demo — логи', 'Unknown'],
  );
});

for (const name of ['showMessageBox', 'showMessageBoxSync']) {
  test(`shim translates ${name} options and preserves other arguments and results`, t => {
    const result = name.endsWith('Sync') ? 1 : Promise.resolve({ response: 1 });
    const original = t.mock.fn(() => result);
    const { electron } = loadShim(t, { dialog: { [name]: original } });
    const extra = { marker: true };
    const options = {
      title: 'Open',
      message: 'Demo Logs',
      detail: 'Unknown',
      checkboxLabel: 'Open',
      buttons: ['Open', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    };

    assert.equal(electron.dialog[name](options, extra), result);
    assert.equal(options.title, 'Открыть');
    assert.equal(options.message, 'Demo — логи');
    assert.equal(options.detail, 'Unknown');
    assert.equal(options.checkboxLabel, 'Открыть');
    assert.deepEqual(options.buttons, ['Открыть', 'Отмена']);
    assert.equal(options.defaultId, 0);
    assert.equal(options.cancelId, 1);
    assert.equal(original.mock.calls[0].arguments[0], options);
    assert.equal(original.mock.calls[0].arguments[1], extra);
    assert.equal(original.mock.calls[0].this, electron.dialog);
  });
}

test('shim preserves notification instances, static methods, and other options', t => {
  class Notification {
    static isSupported() {
      return true;
    }

    constructor(options, extra) {
      this.options = options;
      this.extra = extra;
    }
  }
  const { electron } = loadShim(t, { Notification });
  const options = { title: 'Open', body: 'Demo Logs', silent: true };
  const extra = {};
  const notification = new electron.Notification(options, extra);

  assert.ok(notification instanceof Notification);
  assert.ok(notification instanceof electron.Notification);
  assert.equal(electron.Notification.isSupported(), true);
  assert.deepEqual(options, { title: 'Открыть', body: 'Demo — логи', silent: true });
  assert.equal(notification.options, options);
  assert.equal(notification.extra, extra);
});

test('shim translates ipcMain.handle results by exact matches only', async t => {
  const registered = {};
  const ipcMain = {
    handle: t.mock.fn((channel, handler) => {
      registered[channel] = handler;
    }),
  };
  const { electron } = loadShim(t, { ipcMain });

  electron.ipcMain.handle('demo:data', async () => ({
    title: 'Open',
    nested: { list: ['Open', 'Demo Logs', 42] },
    when: new Date(0),
    big: 'x'.repeat(5000),
  }));

  const result = await registered['demo:data']();

  assert.equal(result.title, 'Открыть');
  assert.deepEqual(result.nested.list, ['Открыть', 'Demo Logs', 42]);
  assert.ok(result.when instanceof Date);
  assert.equal(result.big, 'x'.repeat(5000));
});

test('shim translates webContents.send payloads by exact matches only', t => {
  const created = [];
  const app = {
    getPath: () => process.env.APPDATA || '.',
    on: t.mock.fn((event, callback) => {
      if (event === 'web-contents-created') created.push(callback);
    }),
  };
  loadShim(t, { app });
  assert.ok(created.length >= 1);

  const sent = [];
  const wc = { send: (channel, payload) => sent.push([channel, payload]) };
  created[created.length - 1]({}, wc);

  wc.send('demo:push', { name: 'Open', items: ['Open'] });

  assert.deepEqual(sent[0][1], { name: 'Открыть', items: ['Открыть'] });
});

test('shim translates synchronous IPC responses (event.returnValue)', t => {
  const registered = {};
  const ipcMain = {
    handle: t.mock.fn(),
    on: t.mock.fn((channel, handler) => {
      registered[channel] = handler;
    }),
  };
  const { electron } = loadShim(t, { ipcMain });

  electron.ipcMain.on('demo:sync', event => {
    event.returnValue = 'Open';
  });

  const event = { returnValue: null };
  registered['demo:sync'](event);

  assert.equal(event.returnValue, 'Открыть');
});

test('shim translates executeJavaScript code by exact dictionary entries', t => {
  const created = [];
  const app = {
    getPath: () => process.env.APPDATA || '.',
    on: t.mock.fn((event, callback) => {
      if (event === 'web-contents-created') created.push(callback);
    }),
  };
  loadShim(t, { app });

  const executed = [];
  const wc = { send: () => {}, executeJavaScript: code => executed.push(code) };
  created[created.length - 1]({}, wc);

  wc.executeJavaScript('window.__cfg = { hint: "Project Logs" };');
  wc.executeJavaScript('window.x = 1;');

  assert.match(executed[0], /Точный перевод/);
  assert.doesNotMatch(executed[1], /Точный перевод/);
});

test('shim translates window constructor titles and setTitle while preserving this', t => {
  class BrowserWindow {
    static getAllWindows() {
      return [];
    }

    constructor(options, extra) {
      this.options = options;
      this.extra = extra;
    }

    setTitle(title) {
      this.title = title;
      return this;
    }
  }
  const { electron } = loadShim(t, { BrowserWindow });
  const options = { title: 'Demo Logs', width: 800 };
  const extra = {};
  const window = new electron.BrowserWindow(options, extra);

  assert.ok(window instanceof BrowserWindow);
  assert.ok(window instanceof electron.BrowserWindow);
  assert.deepEqual(electron.BrowserWindow.getAllWindows(), []);
  assert.deepEqual(options, { title: 'Demo — логи', width: 800 });
  assert.equal(window.extra, extra);
  assert.equal(window.setTitle('Open'), window);
  assert.equal(window.title, 'Открыть');
});

test('shim tolerates missing Electron APIs', t => {
  assert.doesNotThrow(() => loadShim(t, {}));
});

test('logging failures do not interrupt Electron API calls', t => {
  const result = { menu: true };
  const build = t.mock.fn(() => result);
  const { electron, writeLog } = loadShim(
    t,
    { Menu: { buildFromTemplate: build } },
    { failLogging: true },
  );
  const template = [{ label: 'Open' }];

  assert.equal(electron.Menu.buildFromTemplate(template), result);
  assert.equal(template[0].label, 'Открыть');
  assert.equal(build.mock.callCount(), 1);
  assert.ok(writeLog.mock.callCount() >= 2);
});
