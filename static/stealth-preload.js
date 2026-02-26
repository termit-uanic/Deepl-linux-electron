/**
 * Stealth preload — executed in the context of the page BEFORE any page-JS.
 * Requires contextIsolation: false to work in the main world.
 */

// navigator.webdriver (additional insurance for --disable-blink-features)
try {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true
    });
} catch (_) {}

// navigator.plugins — emulation of the standard Chrome plugin set on Linux
try {
    const makePlugin = (name, desc, filename, mimeType) => {
        const mime = { type: mimeType, suffixes: 'pdf', description: desc, enabledPlugin: null };
        const plugin = { name, description: desc, filename, length: 1, 0: mime, item: i => (i === 0 ? mime : null), namedItem: n => (n === mimeType ? mime : null) };
        mime.enabledPlugin = plugin;
        return plugin;
    };
    const plugins = [
        makePlugin('PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', 'application/pdf'),
        makePlugin('Chrome PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', 'application/pdf'),
        makePlugin('Chromium PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', 'application/pdf'),
        makePlugin('Microsoft Edge PDF Viewer', 'Portable Document Format', 'internal-pdf-viewer', 'application/pdf'),
        makePlugin('WebKit built-in PDF', 'Portable Document Format', 'internal-pdf-viewer', 'application/pdf')
    ];
    plugins.item = i => plugins[i] || null;
    plugins.namedItem = n => plugins.find(p => p.name === n) || null;
    plugins.refresh = () => {};
    Object.defineProperty(navigator, 'plugins', { get: () => plugins, configurable: true });
} catch (_) {}

// navigator.mimeTypes
try {
    const mimes = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }
    ];
    mimes.item = i => mimes[i] || null;
    mimes.namedItem = n => mimes.find(m => m.type === n) || null;
    Object.defineProperty(navigator, 'mimeTypes', { get: () => mimes, configurable: true });
} catch (_) {}

// navigator.languages
try {
    Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true
    });
} catch (_) {}

// navigator.language
try {
    Object.defineProperty(navigator, 'language', {
        get: () => 'en-US',
        configurable: true
    });
} catch (_) {}

// navigator.pdfViewerEnabled (Chrome always returns true)
try {
    Object.defineProperty(navigator, 'pdfViewerEnabled', {
        get: () => true,
        configurable: true
    });
} catch (_) {}

// window.chrome — an object present in real Chrome
try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) {
        window.chrome.runtime = {
            connect: function() {},
            sendMessage: function() {},
            id: undefined
        };
    }
    if (!window.chrome.app) {
        window.chrome.app = {
            isInstalled: false,
            InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
            RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
        };
    }
    if (!window.chrome.csi) {
        window.chrome.csi = function() { return {}; };
    }
    if (!window.chrome.loadTimes) {
        window.chrome.loadTimes = function() { return {}; };
    }
} catch (_) {}

// Permissions API — normalization
try {
    const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
    window.navigator.permissions.query = function(params) {
        if (params.name === 'notifications') {
            return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return origQuery(params);
    };
} catch (_) {}

// navigator.connection (Network Information API)
try {
    if (!navigator.connection) {
        Object.defineProperty(navigator, 'connection', {
            get: () => ({
                effectiveType: '4g',
                rtt: 50,
                downlink: 10,
                saveData: false,
                onchange: null,
                addEventListener: function() {},
                removeEventListener: function() {},
                dispatchEvent: function() { return true; }
            }),
            configurable: true
        });
    }
} catch (_) {}

// navigator.hardwareConcurrency (typical value for desktop)
try {
    if (!navigator.hardwareConcurrency || navigator.hardwareConcurrency < 2) {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
            get: () => 8,
            configurable: true
        });
    }
} catch (_) {}

// navigator.deviceMemory
try {
    if (!navigator.deviceMemory) {
        Object.defineProperty(navigator, 'deviceMemory', {
            get: () => 8,
            configurable: true
        });
    }
} catch (_) {}

// Hide iframe detection via contentWindow.chrome
try {
    const origCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
        const el = origCreateElement(tagName, options);
        if (tagName.toLowerCase() === 'iframe') {
            const origContentWindow = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
            // Cross-origin iframes cannot be patched, but for same-origin:
            // leave as is — Cloudflare turnstile iframe cross-origin
        }
        return el;
    };
    document.createElement.toString = () => 'function createElement() { [native code] }';
} catch (_) {}

// toString() for overridden functions — so they don't show up as “[native code]”
try {
    const fakeNative = (fn, name) => {
        fn.toString = () => `function ${name || fn.name || ''}() { [native code] }`;
        return fn;
    };
    // Already defined getters are protected via configurable, but if CF calls .toString
    // on objects, we will intercept it.
} catch (_) {}

console.log('[stealth-preload] patches applied');
