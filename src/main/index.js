let url = '';
let URL = require('url');
let path = require('path');
let fs = require('fs')

let gShortcut;

let isRemoveLineBreaks = false;
let isHiddenOnStartup = false;
let windowWidth;
let windowHeight;

const Store = require('electron-store');
const store = new Store();

const {
    app,
    BrowserView,
    BrowserWindow,
    dialog,
    globalShortcut,
    ipcMain,
    Menu,
    shell,
    nativeImage,
    Tray,
    clipboard,
    session
} = require('electron');
require('@electron/remote/main').initialize();
var win = null;
var appQuitting = false;
const appName = 'Deepl-Linux-Electron';
const chromiumVersion = process.versions.chrome || '130.0.0.0';
const chromiumMajor = chromiumVersion.split('.')[0];
const userAgent = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromiumVersion} Safari/537.36`;

// Remove the automation flag (navigator.webdriver = false for all frames)
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
// UA at the Chromium level — affects all requests and navigator.userAgent
app.userAgentFallback = userAgent;

app.setAboutPanelOptions({
    applicationName: appName,
    applicationVersion: app.getVersion(),
    copyright: '© 2021-2025 kumakichi'
})


app.on('ready', function() {
    let Menu = require('electron').Menu;
    //console.log(app.getPath('userData'));

    const ses = session.fromPartition('persist:main');

    // Modern and stable user agent for the entire session
    ses.setUserAgent(userAgent);

    // Forced overwrite sec-ch-ua — Chromium in Electron sends Electron branding
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        const headers = { ...details.requestHeaders };
        if (!headers['Accept-Language']) headers['Accept-Language'] = 'en-US,en;q=0.9';
        // Always overwrite Client Hints — Electron sends its default brand
        headers['sec-ch-ua'] = `"Chromium";v="${chromiumMajor}", "Not_A Brand";v="24", "Google Chrome";v="${chromiumMajor}"`;
        headers['sec-ch-ua-platform'] = '"Linux"';
        headers['sec-ch-ua-mobile'] = '?0';
        headers['sec-ch-ua-arch'] = '"x86"';
        headers['sec-ch-ua-bitness'] = '"64"';
        callback({ requestHeaders: headers });
    });

    // Cloudflare/Turnstile logs
    ses.webRequest.onCompleted((details) => {
        const u = details.url || '';
        if (u.includes('clearance.deepl.com') || u.includes('/cdn-cgi/')) {
            console.log('[CF completed]', details.statusCode, u);
        }
    });
    ses.webRequest.onErrorOccurred((details) => {
        const u = details.url || '';
        if (u.includes('clearance.deepl.com') || u.includes('/cdn-cgi/')) {
            console.warn('[CF error]', details.error, u);
        }
    });




    isRemoveLineBreaks = store.get('remove_line_breaks');
    isHiddenOnStartup = store.get('hidden_on_startup');
    windowWidth = store.get('window_width');
    windowHeight = store.get('window_height');
    let templateArr = [{
        label: "Settings",
        submenu: [{
            label: "Shortcut",
            click: () => {
                const hotkeySettingsWindow = new BrowserWindow({
                    frame: false,
                    height: 50,
                    width: 280,
                    webPreferences: {
                        nodeIntegration: true,
                        enableRemoteModule: true,
                        preload: path.join(__static, 'hotkey.js')
                    }
                })
                //                                        hotkeySettingsWindow.webContents.openDevTools();
                require('@electron/remote/main').enable(hotkeySettingsWindow.webContents)

                hotkeySettingsWindow.loadFile(path.join(__static, 'hotkey.html'))
            }
        }, {
            label: "Window size",
            click: () => {
                const settingsWindowSize = new BrowserWindow({
                    frame: false,
                    height: 125,
                    width: 200,
                    webPreferences: {
                        nodeIntegration: true,
                        enableRemoteModule: true,
                        preload: path.join(__static, 'window-size.js')
                    }
                })
                require('@electron/remote/main').enable(settingsWindowSize.webContents)
                settingsWindowSize.loadFile(path.join(__static, 'window-size.html'))
            }
        }, {
            label: "Remove Line Breaks",
            type: "checkbox",
            checked: isRemoveLineBreaks,
            click: (item) => {
                isRemoveLineBreaks = item.checked;
                store.set('remove_line_breaks', isRemoveLineBreaks);
                //win.webContents.send('translateClipboard', item.checked);
                translateClipboard(item.checked);
            }
        }, {
            label: "Hidden on startup",
            type: "checkbox",
            checked: isHiddenOnStartup,
            click: (item) => {
                isHiddenOnStartup = item.checked;
                store.set('hidden_on_startup', isHiddenOnStartup);
            }
        }, {
            type: 'separator'
        }, {
            label: 'Reload',
            role: 'reload'
        }, {
            label: "Quit",
            role: 'quit'
        }]
    }, {
        label: "Help",
        submenu: [{
            label: "Learn More",
            click: async () => {
                await shell.openExternal('https://github.com/kumakichi/Deepl-linux-electron')
            }
        }, {
            label: "About",
            click: async () => {
                await app.showAboutPanel();
            }
        }]
    }];
    if (process.platform === 'darwin') {
        templateArr.unshift({
            label: ''
        })
    }
    let menu = Menu.buildFromTemplate(templateArr);
    Menu.setApplicationMenu(menu);

    tray = new Tray(nativeImage.createFromPath(path.join(__static, 'tray-icon.png')))
    const contextMenu = Menu.buildFromTemplate([{
        label: 'Quit',
        click() {
            appQuitting = true
            app.quit()
        }
    }])
    tray.setToolTip('Deepl-Linux-Electron')
    tray.setContextMenu(contextMenu)

    let ss = store.get('short_key');
    if (!ss) {
        console.log("========>not found, fill with default");
        store.set('short_key', 'Control+Alt+C');
    }
    gShortcut = store.get('short_key');
    console.log("============ use shortKey:", gShortcut);
    registerShortcut(gShortcut);

    // Clearing old CF cookies to start with a clean slate
    (async () => {
        try {
            const cookies = await ses.cookies.get({ url: 'https://www.deepl.com' });
            for (const c of cookies) {
                if (c.name === 'cf_clearance' || c.name === '__cf_bm') {
                    await ses.cookies.remove('https://www.deepl.com', c.name);
                    console.log('[CF] removed stale cookie:', c.name);
                }
            }
        } catch (_) {}
    })();

    win = new BrowserWindow({
        title: "Deepl-Linux-Electron",
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            enableRemoteModule: false,
            contextIsolation: false,   // preload works in the main world of the page
            sandbox: false,            // required for preload
            preload: path.join(__static, 'stealth-preload.js'),
            partition: 'persist:main'
        },
        show: !isHiddenOnStartup
    });

    console.log("============ restore window size:", windowWidth, 'x', windowHeight)
    if (windowWidth && windowHeight) {
        win.setSize(parseInt(windowWidth, 10), parseInt(windowHeight, 10), false)
    }

    // navigator.userAgentData — injection via JS for the main frame
    // (preload cannot template variables from the main process)
    win.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
        if (!isMainFrame) return;
        win.webContents.executeJavaScript(`
            try {
                Object.defineProperty(navigator, 'userAgentData', {
                    get: () => ({
                        brands: [
                            { brand: 'Chromium', version: '${chromiumMajor}' },
                            { brand: 'Not_A Brand', version: '24' },
                            { brand: 'Google Chrome', version: '${chromiumMajor}' }
                        ],
                        mobile: false,
                        platform: 'Linux',
                        getHighEntropyValues: (hints) => Promise.resolve({
                            architecture: 'x86',
                            bitness: '64',
                            brands: [
                                { brand: 'Chromium', version: '${chromiumVersion}' },
                                { brand: 'Not_A Brand', version: '24.0.0.0' },
                                { brand: 'Google Chrome', version: '${chromiumVersion}' }
                            ],
                            fullVersionList: [
                                { brand: 'Chromium', version: '${chromiumVersion}' },
                                { brand: 'Not_A Brand', version: '24.0.0.0' },
                                { brand: 'Google Chrome', version: '${chromiumVersion}' }
                            ],
                            mobile: false,
                            model: '',
                            platform: 'Linux',
                            platformVersion: '6.1.0',
                            uaFullVersion: '${chromiumVersion}'
                        })
                    }),
                    configurable: true
                });
            } catch(_) {}
        `).catch(() => {});
    });

    win.loadURL("https://www.deepl.com/translator");

    //win.webContents.openDevTools();
    win.on('close', function(evt) {
        if (!appQuitting) {
            evt.preventDefault();
            win.hide();
        }
    });

        // Deferred insertion of user CSS until cf_clearance appears
    const insertUserCssIfAny = () => {
        const appConfigPath = path.join(app.getPath('appData'), appName);
        const cssPath = path.join(appConfigPath, 'user_theme.css');
        fs.readFile(cssPath, 'utf8', (err, data) => {
            if (!err && data && data.length > 0) {
                win.webContents.insertCSS(data).catch(() => {});
            }
        });
    };
    const waitCfAndThen = async (fn, timeoutMs = 8000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const cookies = await ses.cookies.get({ url: 'https://www.deepl.com' });
                if (cookies.some(c => c.name === 'cf_clearance')) return fn();
            } catch (_) {}
            await new Promise(r => setTimeout(r, 500));
        }
        console.warn('cf_clearance not set within timeout, proceeding anyway');
        fn();
    };


    win.webContents.on('did-finish-load', async () => {
        try {
            const cookies = await ses.cookies.get({ url: 'https://www.deepl.com' });
            const cf = cookies.filter(c => c.name === 'cf_clearance' || c.name === '__cf_bm');
            console.log(cf.length ? ('Cloudflare cookies: ' + cf.map(c => c.name).join(', ')) : 'Cloudflare cookies not present yet');
        } catch (e) {
            console.error('Cookies read error', e);
        }
        waitCfAndThen(insertUserCssIfAny, 6000);
    });

})

app.on('will-quit', () => {
    globalShortcut.unregister(gShortcut);
});

ipcMain.on('set-hotkey', (event, arg) => {
    console.log("========got new key from :", arg)
    if (!registerShortcut(arg, gShortcut)) {
        event.reply('set-hotkey-reply', false);
        return;
    }

    store.set('short_key', arg);
    event.reply('set-hotkey-reply', true, arg);
})

ipcMain.on('set-window-size', (event, argWidth, argHeight) => {
    console.log("========got new window size :", argWidth, 'x', argHeight)

    store.set('window_width', argWidth);
    store.set('window_height', argHeight);
    event.reply('set-window-size-reply', true, argWidth, argHeight);
    win.setSize(parseInt(argWidth, 10), parseInt(argHeight, 10), true)
})

function registerShortcut(newShortcut, oldShortcut) {
    let shortcut = globalShortcut.register(newShortcut, () => {
        //win.webContents.send('translateClipboard', isRemoveLineBreaks);
        translateClipboard(isRemoveLineBreaks);
        win.show()
    });

    if (!shortcut) {
        messageBox("error", "Register shortcut fail", `You will not be able to use ${newShortcut}`);
        return false;
    }

    if (oldShortcut) {
        globalShortcut.unregister(oldShortcut);
    }
    gShortcut = newShortcut;
    return true;
}

function messageBox(type, title, message) {
    let result = dialog.showMessageBoxSync({
        type: type,
        title: title,
        message: message,
        buttons: ["OK"]
    });
}

function translateClipboard(isChecked) {
    let txt = (isChecked) ? clipboard.readText().split("\n").join(" ") : clipboard.readText();
    // We are waiting for the input field to appear so as not to interfere with the challenge.
    win.webContents.executeJavaScript(`
      (function(){
        const apply = () => {
          const el = document.querySelector('d-textarea');
          if (!el) return false;
          el.value = \`${txt}\`;
          el.dispatchEvent(new InputEvent('input', { inputType: 'insertFromPaste', data: \`${txt}\` }));
          return true;
        };
        if (!apply()) {
          const id = setInterval(() => { if (apply()) clearInterval(id); }, 400);
          setTimeout(() => clearInterval(id), 10000);
        }
      })();
    `);
}
