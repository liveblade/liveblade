/*!
 * LiveBlade Core
 * Production-ready AJAX for Laravel Blade
 *
 * @license MIT
 * @docs https://liveblade.dev
 */

;(function (window, document) {
    "use strict";

    if (window.LiveBlade) return;

    const VERSION = "2.0.0";
    const DEBUG = localStorage.getItem("lb_debug") === "1";

    /**
     * ============================================================
     * UTILITIES
     * ============================================================
     */
    function log(...args) {
        if (DEBUG) console.log("[LiveBlade]", ...args);
    }

    function warn(...args) {
        console.warn("[LiveBlade]", ...args);
    }

    function error(...args) {
        console.error("[LiveBlade]", ...args);
    }

    const escapeHtml = (str) => {
        if (str == null) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    const cssEscape = (str) => {
        if (str == null) return "";
        if (typeof CSS !== "undefined" && CSS.escape) {
            return CSS.escape(str);
        }
        return String(str).replace(/([^\w-])/g, "\\$1");
    };

    function sameOrigin(url) {
        try {
            const u = new URL(url, window.location.href);
            return u.origin === window.location.origin;
        } catch {
            return false;
        }
    }

    let uniqueIdCounter = 0;
    function uniqueId(prefix = "lb") {
        return `${prefix}_${++uniqueIdCounter}_${Date.now().toString(36)}`;
    }

    function debounce(fn, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function throttle(fn, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    function parseUrl(url) {
        try {
            const u = new URL(url, window.location.href);
            return {
                path: u.pathname,
                params: Object.fromEntries(u.searchParams.entries()),
                hash: u.hash
            };
        } catch {
            return { path: "/", params: {}, hash: "" };
        }
    }

    function buildUrl(path, params, hash = "") {
        const u = new URL(path, window.location.href);
        u.search = "";
        Object.entries(params).forEach(([k, v]) => {
            if (v != null && v !== "") u.searchParams.set(k, v);
        });
        return u.pathname + u.search + (hash || "");
    }

    /**
     * ============================================================
     * CORE LIVEBLADE OBJECT
     * ============================================================
     */
    const LiveBlade = {
        version: VERSION,
        controllers: new WeakMap(),
        instances: new Set(),

        config: {
            debounce: 300,
            throttle: 100,
            retryDelay: 2000,
            maxRetries: 3,
            requestTimeout: 30000,

            skeletonHTML: null,
            errorHTML: null,
            successDuration: 1500,
            errorDuration: 3000,

            updateUrl: false,
            updateUrlMode: "push",

            preserveScroll: true,
            preserveInputs: true,
            preserveFocus: true,

            smartUpdate: true,
            contentHashLength: 500
        },

        csrf: null,
        _events: Object.create(null),
        _features: Object.create(null),
        _binders: Object.create(null),
        _initialized: false
    };

    /**
     * ============================================================
     * UTILITIES EXPORT
     * ============================================================
     */
    LiveBlade.utils = {
        log,
        warn,
        error,
        escapeHtml,
        cssEscape,
        sameOrigin,
        uniqueId,
        debounce,
        throttle,
        parseUrl,
        buildUrl
    };

    /**
     * ============================================================
     * CSRF TOKEN MANAGEMENT
     * ============================================================
     */
    LiveBlade.refreshCsrf = function () {
        this.csrf = document.querySelector('meta[name="csrf-token"]')?.content || "";
        if (!this.csrf) warn("CSRF token not found.");
        return this;
    };

    LiveBlade.getCsrf = function () {
        if (!this.csrf) this.refreshCsrf();
        return this.csrf;
    };

    /**
     * ============================================================
     * EVENT EMITTER
     * ============================================================
     */
    LiveBlade.on = function (event, handler) {
        if (typeof handler !== "function") return this;
        (this._events[event] ||= []).push(handler);
        return this;
    };

    LiveBlade.off = function (event, handler) {
        if (!this._events[event]) return this;
        if (handler) {
            this._events[event] = this._events[event].filter((h) => h !== handler);
        } else {
            delete this._events[event];
        }
        return this;
    };

    LiveBlade.emit = function (event, payload) {
        (this._events[event] || []).forEach((h) => {
            try { h(payload); } catch (e) { error("Event listener error:", e); }
        });
        return this;
    };

    LiveBlade.once = function (event, handler) {
        const wrapper = (payload) => {
            this.off(event, wrapper);
            handler(payload);
        };
        return this.on(event, wrapper);
    };

    /**
     * ============================================================
     * PLUGIN/FEATURE SYSTEM
     * ============================================================
     */
    LiveBlade.use = function (plugin, options = {}) {
        if (typeof plugin === "function") plugin(this, options);
        else if (plugin?.install) plugin.install(this, options);
        return this;
    };

    LiveBlade.registerFeature = function (name, feature) {
        if (this._features[name]) {
            warn(`Feature "${name}" already registered.`);
            return this;
        }
        this._features[name] = feature;
        if (typeof feature.init === "function") {
            feature.init(this);
        }
        log(`Feature "${name}" registered.`);
        return this;
    };

    LiveBlade.hasFeature = function (name) {
        return !!this._features[name];
    };

    /**
     * ============================================================
     * BINDER REGISTRY
     * ============================================================
     */
    LiveBlade.registerBinder = function (name, binder) {
        if (this._binders[name]) {
            warn(`Binder "${name}" already registered.`);
            return this;
        }
        this._binders[name] = binder;
        log(`Binder "${name}" registered.`);
        return this;
    };

    /**
     * ============================================================
     * CONTROLLER RESOLUTION
     * ============================================================
     */
    LiveBlade.resolve = function (el) {
        if (!el) return null;

        const targetSelector = el.getAttribute("data-lb-target");
        if (targetSelector) {
            const target = document.querySelector(targetSelector);
            return target ? LiveBlade.controllers.get(target) : null;
        }

        const container = el.closest('[data-lb="html"], [data-lb-html], [data-lb-container]');
        return container ? LiveBlade.controllers.get(container) : null;
    };

    /**
     * ============================================================
     * BINDING ENGINE
     * ============================================================
     */
    LiveBlade.bind = function (root = document) {
        Object.entries(this._binders).forEach(([name, binder]) => {
            if (!binder.selector) return;

            const elements = root.querySelectorAll(`${binder.selector}:not([data-lb-bound~="${name}"])`);
            elements.forEach((el) => {
                try {
                    binder.bind(el, this);
                    // Mark as bound for this binder
                    const bound = el.getAttribute("data-lb-bound") || "";
                    el.setAttribute("data-lb-bound", (bound + " " + name).trim());
                } catch (e) {
                    error(`Binder "${name}" error:`, e);
                }
            });
        });

        return this;
    };

    /**
     * ============================================================
     * PUBLIC API
     * ============================================================
     */
    LiveBlade.refresh = function (selector) {
        if (typeof selector === "string") {
            const ctrl = LiveBlade.controllers.get(document.querySelector(selector));
            if (ctrl) ctrl.refresh();
        } else if (selector instanceof HTMLElement) {
            const ctrl = LiveBlade.controllers.get(selector);
            if (ctrl) ctrl.refresh();
        } else {
            LiveBlade.instances.forEach((ctrl) => ctrl.refresh());
        }
        return this;
    };

    LiveBlade.cleanup = function (root = document) {
        root.querySelectorAll("[data-lb-bound]").forEach((el) => {
            const ctrl = LiveBlade.controllers.get(el);
            if (ctrl?.dispose) ctrl.dispose();
            LiveBlade.controllers.delete(el);
            el.removeAttribute("data-lb-bound");
            if (el._lbDataTimer) { clearInterval(el._lbDataTimer); delete el._lbDataTimer; }
        });
        return this;
    };

    LiveBlade.configure = function (options) {
        if (options && typeof options === "object") Object.assign(LiveBlade.config, options);
        return this;
    };

    LiveBlade.debug = function (enable = true) {
        localStorage.setItem("lb_debug", enable ? "1" : "0");
        console.log("[LiveBlade] Debug mode " + (enable ? "enabled" : "disabled") + ". Reload page.");
        return this;
    };

    LiveBlade.test = function (selector) {
        const el = typeof selector === "string" ? document.querySelector(selector) : selector;
        if (!el) { console.log("❌ Not found:", selector); return null; }

        console.log("✅ Found:", el);
        const ctrl = LiveBlade.resolve(el);
        if (ctrl) console.log("🎮 Controller:", ctrl.id, ctrl.getUrl());
        return { el, ctrl };
    };

    LiveBlade.getController = function (selector) {
        const el = typeof selector === "string" ? document.querySelector(selector) : selector;
        return el ? LiveBlade.controllers.get(el) : null;
    };

    LiveBlade.getAllControllers = () => Array.from(LiveBlade.instances);

    /**
     * ============================================================
     * INITIALIZATION
     * ============================================================
     */
    LiveBlade.init = function () {
        if (this._initialized) return this;
        this._initialized = true;

        this.refreshCsrf();

        document.addEventListener("csrf-token-update", () => this.refreshCsrf());

        // Bind all registered binders
        this.bind();

        log("Initialized v" + VERSION);
        this.emit("init");

        return this;
    };

    // Auto-init on DOM ready
    function domReady(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    domReady(() => LiveBlade.init());

    // Export
    window.LiveBlade = LiveBlade;

})(window, document);
