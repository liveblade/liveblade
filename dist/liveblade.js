/*!
 * LiveBlade v2.0.0
 * Production-ready AJAX for Laravel Blade
 * @license MIT
 *
 * Included:
 *   - core
 *   - html-controller
 *   - rate-limiter
 *   - state
 *   - html
 *   - nav
 *   - search
 *   - filter
 *   - sort
 *   - button
 *   - toggle
 *   - data
 *   - pagination
 *   - quick-search
 */


// ============================================================
// core.js
// ============================================================
;(function (window, document) {
    "use strict";

    if (window.LiveBlade) return;

    const VERSION = "1.0.1";
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


// ============================================================
// html-controller.js
// ============================================================
/**
 * LiveBlade Feature: HTML Controller
 * Core AJAX content loading with URL management, retries, and smart updates
 */

;(function (window, document) {
    "use strict";

    /**
     * Content comparison helper
     */
    function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash = hash & hash;
        }
        return hash;
    }

    function detectContentChanges(oldHTML, newHTML, hashLength = 500) {
        if (oldHTML === newHTML) return false;
        if (!oldHTML || !newHTML) return true;
        if (oldHTML.length !== newHTML.length) return true;

        return oldHTML.slice(0, hashLength) !== newHTML.slice(0, hashLength) ||
               oldHTML.slice(-hashLength) !== newHTML.slice(-hashLength) ||
               simpleHash(oldHTML) !== simpleHash(newHTML);
    }

    /**
     * Default templates
     */
    function getSkeletonHTML(config) {
        return config.skeletonHTML || `
            <div class="lb-skeleton" role="status" aria-label="Loading">
                <div class="lb-skeleton-line"></div>
                <div class="lb-skeleton-line" style="width:90%"></div>
                <div class="lb-skeleton-line" style="width:75%"></div>
            </div>
        `;
    }

    function getErrorHTML(message, offline = false, escapeHtml) {
        const msg = offline ? "You appear to be offline." : escapeHtml(message);
        return `
            <div class="lb-error" role="alert">
                <div class="lb-error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <strong>Failed to load content</strong>
                <p>${msg}</p>
                <button type="button" class="lb-retry-btn" data-lb-action="refresh">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                    Try Again
                </button>
            </div>
        `;
    }

    /**
     * HTML Controller Class
     */
    function HtmlController(el, LiveBlade) {
        this.el = el;
        this.LiveBlade = LiveBlade;
        this.id = LiveBlade.utils.uniqueId("ctrl");
        this.path = "/";
        this.params = {};
        this.hash = "";

        this.abortController = null;
        this.timeoutId = null;
        this.refreshTimer = null;

        this.requestId = 0;
        this.retryCount = 0;
        this.lastHTML = null;

        this._historyInitialized = false;
        this._disposed = false;

        if (!el.getAttribute("role")) el.setAttribute("role", "region");
        if (!el.getAttribute("aria-live")) el.setAttribute("aria-live", "polite");

        LiveBlade.instances.add(this);
        this._initFromAttributes();
    }

    HtmlController.prototype._initFromAttributes = function () {
        const el = this.el;
        const initUrl = el.getAttribute("data-lb-fetch") ||
                        el.getAttribute("data-lb-html") ||
                        el.getAttribute("data-lb");

        if (initUrl && initUrl !== "html") this.setUrl(initUrl);

        const interval = parseInt(el.getAttribute("data-lb-interval"), 10);
        if (interval > 0) {
            this.refreshTimer = setInterval(() => {
                if (!this._disposed) this.refresh();
            }, interval * 1000);
        }

        if (initUrl && initUrl !== "html") {
            this.load(false, { pushState: false, isInitial: true });
        }
    };

    HtmlController.prototype.setUrl = function (url) {
        const { sameOrigin, parseUrl } = this.LiveBlade.utils;
        if (!url || !sameOrigin(url)) return this;
        const parsed = parseUrl(url);
        this.path = parsed.path;
        this.params = parsed.params;
        this.hash = parsed.hash;
        return this;
    };

    HtmlController.prototype.updateParam = function (key, value) {
        if (value == null || value === "") delete this.params[key];
        else this.params[key] = String(value);
        return this;
    };

    HtmlController.prototype.updateParams = function (params) {
        Object.entries(params).forEach(([k, v]) => this.updateParam(k, v));
        return this;
    };

    HtmlController.prototype.resetPage = function () {
        delete this.params.page;
        return this;
    };

    HtmlController.prototype.getUrl = function () {
        return this.LiveBlade.utils.buildUrl(this.path, this.params, this.hash);
    };

    HtmlController.prototype.showSkeleton = function () {
        if (this.el.innerHTML.trim()) return;
        this.el.innerHTML = getSkeletonHTML(this.LiveBlade.config);
    };

    HtmlController.prototype.setLoading = function (loading) {
        this.el.classList.toggle("lb-loading", loading);
        this.el.setAttribute("aria-busy", loading ? "true" : "false");
        this.LiveBlade.emit(loading ? "loading:start" : "loading:end", { controller: this });
    };

    HtmlController.prototype.abortPendingRequest = function () {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    };

    HtmlController.prototype.load = async function (append = false, opts = {}) {
        if (this._disposed) return;

        const { sameOrigin, log, escapeHtml } = this.LiveBlade.utils;
        const config = this.LiveBlade.config;

        const url = this.getUrl();
        if (!url || !sameOrigin(url)) return;

        // Rate limiting check
        if (this.LiveBlade.rateLimiter && !this.LiveBlade.rateLimiter.canRequest(url)) return;

        this.requestId += 1;
        const currentRequestId = this.requestId;

        if (opts.isInitial && !append) this.showSkeleton();

        this.abortPendingRequest();
        this.abortController = new AbortController();

        this.timeoutId = setTimeout(() => {
            if (this.abortController) this.abortController.abort();
        }, config.requestTimeout);

        const prevHTML = this.el.innerHTML;

        // Save state if feature is available
        const savedState = this.LiveBlade.state?.saveAll(this.el, config);

        this.setLoading(true);
        log("Fetching:", url);

        let response, data;

        try {
            response = await fetch(url, {
                method: "GET",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-LiveBlade": "true",
                    "Accept": "application/json, text/html",
                    "X-CSRF-TOKEN": this.LiveBlade.getCsrf()
                },
                credentials: "same-origin",
                signal: this.abortController.signal
            });
        } catch (err) {
            if (this.timeoutId) clearTimeout(this.timeoutId);
            if (err.name === "AbortError") return;
            this.handleError(err, url, append);
            return;
        }

        if (this.timeoutId) clearTimeout(this.timeoutId);
        if (currentRequestId !== this.requestId) return;

        try {
            if (response.redirected) {
                window.location.href = response.url;
                return;
            }

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                data = await response.json();
            } else {
                data = { html: await response.text(), has_more: false };
            }
        } catch (err) {
            this.handleError(err, url, append);
            return;
        } finally {
            this.setLoading(false);
        }

        const html = typeof data.html === "string" ? data.html : "";
        const hasMore = !!data.has_more;
        const contentChanged = append || !config.smartUpdate || detectContentChanges(prevHTML, html, config.contentHashLength);

        if (append) {
            this.el.insertAdjacentHTML("beforeend", html);
        } else if (contentChanged) {
            this.el.innerHTML = html;
            this.lastHTML = html;
        }

        this.el.dataset.lbHasMore = hasMore ? "1" : "0";
        this.retryCount = 0;

        if (contentChanged) this.LiveBlade.bind(this.el);

        // Restore state if not appending
        if (!append && savedState) {
            this.LiveBlade.state?.restoreAll(this.el, savedState);
        }

        // History management
        if (!append && opts.pushState && window.history && config.updateUrl) {
            const newUrl = this.getUrl();
            const historyState = { liveblade: true, controllerId: this.id, path: this.path, params: { ...this.params } };

            if (!this._historyInitialized || opts.replaceState || config.updateUrlMode === "replace") {
                window.history.replaceState(historyState, "", newUrl);
                this._historyInitialized = true;
            } else {
                window.history.pushState(historyState, "", newUrl);
            }
        }

        this.el.dispatchEvent(new CustomEvent("lb:loaded", { detail: { url, data, append }, bubbles: true }));
        this.LiveBlade.emit("loaded", { controller: this, url, data, append, changed: contentChanged });
    };

    HtmlController.prototype.handleError = function (err, url, append) {
        if (this._disposed || err.name === "AbortError") return;

        const { error, escapeHtml } = this.LiveBlade.utils;
        const config = this.LiveBlade.config;

        error("Request failed:", err.message);

        if (this.retryCount < config.maxRetries) {
            this.retryCount++;
            const delay = config.retryDelay * this.retryCount;
            setTimeout(() => { if (!this._disposed) this.load(append, {}); }, delay);
            return;
        }

        const isOffline = navigator?.onLine === false;
        this.el.innerHTML = getErrorHTML(err.message, isOffline, escapeHtml);
        this.LiveBlade.bind(this.el);

        this.el.dispatchEvent(new CustomEvent("lb:error", { detail: { error: err, url }, bubbles: true }));
        this.LiveBlade.emit("error", { controller: this, error: err, url, offline: isOffline });
    };

    HtmlController.prototype.refresh = function () {
        this.resetPage();
        return this.load(false, { pushState: true });
    };

    HtmlController.prototype.navigate = function (url) {
        if (url) this.setUrl(url);
        return this.load(false, { pushState: true });
    };

    HtmlController.prototype.loadMore = function () {
        const page = parseInt(this.params.page || "1", 10);
        this.params.page = String(page + 1);
        return this.load(true);
    };

    HtmlController.prototype.dispose = function () {
        if (this._disposed) return;
        this._disposed = true;

        this.abortPendingRequest();
        if (this.refreshTimer) clearInterval(this.refreshTimer);

        this.LiveBlade.instances.delete(this);
        this.LiveBlade.controllers.delete(this.el);
        this.el.removeAttribute("data-lb-bound");
    };

    /**
     * Feature registration
     */
    const HtmlControllerFeature = {
        init(LiveBlade) {
            // Store controller class on LiveBlade for external access
            LiveBlade.HtmlController = HtmlController;

            // Handle popstate for history navigation
            window.addEventListener("popstate", (ev) => {
                if (!ev.state?.liveblade) return;
                LiveBlade.instances.forEach((ctrl) => {
                    if (ev.state.path) {
                        ctrl.path = ev.state.path;
                        ctrl.params = { ...ev.state.params };
                    } else {
                        ctrl.setUrl(window.location.href);
                    }
                    ctrl.load(false, { pushState: false });
                });
            });

            // Handle online/offline events
            window.addEventListener("online", () => {
                LiveBlade.emit("online");
                LiveBlade.instances.forEach((ctrl) => {
                    if (ctrl.retryCount > 0) { ctrl.retryCount = 0; ctrl.refresh(); }
                });
            });

            window.addEventListener("offline", () => LiveBlade.emit("offline"));
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("html-controller", HtmlControllerFeature);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { HtmlController, HtmlControllerFeature };
    }

})(window, document);


// ============================================================
// rate-limiter.js
// ============================================================
/**
 * LiveBlade Feature: Rate Limiter
 * Prevents excessive requests to the same URL
 */

;(function (window) {
    "use strict";

    const RateLimiter = {
        requests: new Map(),
        maxRequests: 100,
        windowMs: 60000,
        cleanupInterval: null,

        init(LiveBlade) {
            if (this.cleanupInterval) return;
            this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);

            // Expose on LiveBlade
            LiveBlade.rateLimiter = this;
        },

        cleanup() {
            const now = Date.now();
            for (const [key, list] of this.requests) {
                const recent = list.filter((ts) => now - ts < this.windowMs);
                if (recent.length === 0) {
                    this.requests.delete(key);
                } else {
                    this.requests.set(key, recent);
                }
            }
        },

        canRequest(key) {
            const now = Date.now();
            const list = this.requests.get(key) || [];
            const recent = list.filter((ts) => now - ts < this.windowMs);

            if (recent.length >= this.maxRequests) {
                if (window.LiveBlade) {
                    window.LiveBlade.utils.log("Rate limit exceeded:", key);
                }
                return false;
            }

            recent.push(now);
            this.requests.set(key, recent);
            return true;
        },

        reset(key) {
            if (key) {
                this.requests.delete(key);
            } else {
                this.requests.clear();
            }
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("rate-limiter", RateLimiter);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = RateLimiter;
    }

})(window);


// ============================================================
// state.js
// ============================================================
/**
 * LiveBlade Feature: State Preservation
 * Saves and restores scroll position, focus state, and input values
 */

;(function (window) {
    "use strict";

    const StateManager = {
        init(LiveBlade) {
            LiveBlade.state = this;
        },

        /**
         * Scroll Position
         */
        saveScrollPosition(el) {
            return { top: el.scrollTop, left: el.scrollLeft };
        },

        restoreScrollPosition(el, pos) {
            if (!pos) return;
            el.scrollTop = pos.top;
            el.scrollLeft = pos.left;
        },

        /**
         * Focus State
         */
        saveFocusState(root) {
            const active = document.activeElement;
            if (!active || !root.contains(active)) return null;
            return {
                id: active.id,
                name: active.name,
                selectionStart: active.selectionStart,
                selectionEnd: active.selectionEnd
            };
        },

        restoreFocusState(root, state) {
            if (!state) return;

            const cssEscape = window.LiveBlade?.utils?.cssEscape || ((s) => s);
            let el = null;

            if (state.id) el = root.querySelector(`#${cssEscape(state.id)}`);
            if (!el && state.name) el = root.querySelector(`[name="${cssEscape(state.name)}"]`);

            if (el?.focus) {
                el.focus();
                if (state.selectionStart != null && el.setSelectionRange) {
                    try { el.setSelectionRange(state.selectionStart, state.selectionEnd); } catch {}
                }
            }
        },

        /**
         * Input Values
         */
        saveInputStates(root) {
            const inputs = root.querySelectorAll("input, textarea, select");
            const states = [];
            const cssEscape = window.LiveBlade?.utils?.cssEscape || ((s) => s);

            inputs.forEach((input) => {
                const id = input.id;
                const name = input.name;

                let selector = null;
                if (id) {
                    selector = `#${cssEscape(id)}`;
                } else if (name) {
                    const tag = input.tagName.toLowerCase();
                    selector = `${tag}[name="${cssEscape(name)}"]`;
                    if (input.type === "radio") selector += `[value="${cssEscape(input.value)}"]`;
                }

                if (!selector) return;

                const state = { selector, tagName: input.tagName };

                if (input.type === "checkbox") {
                    state.type = "checkbox";
                    state.checked = input.checked;
                } else if (input.type === "radio") {
                    state.type = "radio";
                    state.checked = input.checked;
                } else if (input.tagName === "SELECT") {
                    state.type = "select";
                    state.value = input.value;
                    state.selectedIndex = input.selectedIndex;
                    if (input.multiple) {
                        state.selectedValues = Array.from(input.selectedOptions).map((o) => o.value);
                    }
                } else {
                    state.type = "text";
                    state.value = input.value;
                }

                states.push(state);
            });

            return states;
        },

        restoreInputStates(root, states, skipActiveElement = true) {
            if (!states?.length) return;

            states.forEach((state) => {
                const input = root.querySelector(state.selector);
                if (!input) return;
                if (skipActiveElement && document.activeElement === input) return;

                if (state.type === "checkbox" || state.type === "radio") {
                    input.checked = state.checked;
                } else if (state.type === "select") {
                    if (state.selectedValues && input.multiple) {
                        Array.from(input.options).forEach((opt) => {
                            opt.selected = state.selectedValues.includes(opt.value);
                        });
                    } else {
                        input.value = state.value;
                        if (input.value !== state.value && state.selectedIndex >= 0) {
                            input.selectedIndex = state.selectedIndex;
                        }
                    }
                } else {
                    input.value = state.value;
                }
            });
        },

        /**
         * Save all states at once
         */
        saveAll(root, config = {}) {
            return {
                scroll: config.preserveScroll !== false ? this.saveScrollPosition(root) : null,
                focus: config.preserveFocus !== false ? this.saveFocusState(root) : null,
                inputs: config.preserveInputs !== false ? this.saveInputStates(root) : null
            };
        },

        /**
         * Restore all states at once
         */
        restoreAll(root, saved) {
            if (!saved) return;
            this.restoreScrollPosition(root, saved.scroll);
            this.restoreInputStates(root, saved.inputs);
            this.restoreFocusState(root, saved.focus);
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("state", StateManager);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = StateManager;
    }

})(window);


// ============================================================
// html.js
// ============================================================
/**
 * LiveBlade Feature: HTML Binder
 * Binds data-lb="html" containers to HtmlController
 */

;(function (window) {
    "use strict";

    const HtmlBinder = {
        selector: '[data-lb="html"], [data-lb-html], [data-lb]:not([data-lb="nav"]):not([data-lb="search"]):not([data-lb="filter"]):not([data-lb="button"]):not([data-lb="toggle-update"]):not([data-lb="data"]):not([data-lb="pagination"]):not([data-lb="form"])',

        bind(el, LiveBlade) {
            // Skip if not a container type
            const lbValue = el.getAttribute("data-lb");
            if (lbValue && !lbValue.startsWith("/") && lbValue !== "html") return;

            // Skip if already has controller
            if (LiveBlade.controllers.has(el)) return;

            // Ensure HtmlController is available
            if (!LiveBlade.HtmlController) {
                LiveBlade.utils.warn("HtmlController not available. Include html-controller.js feature.");
                return;
            }

            const ctrl = new LiveBlade.HtmlController(el, LiveBlade);
            LiveBlade.controllers.set(el, ctrl);
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("html", HtmlBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = HtmlBinder;
    }

})(window);


// ============================================================
// nav.js
// ============================================================
/**
 * LiveBlade Feature: Nav Binder
 * Navigation links that load content into a container
 */

;(function (window) {
    "use strict";

    const NavBinder = {
        selector: '[data-lb="nav"], [data-lb-nav]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            const handler = (e) => {
                if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();

                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;

                const url = el.dataset.lbFetch || el.getAttribute("href");
                if (!url || !sameOrigin(url)) return;

                ctrl.setUrl(url);
                ctrl.refresh();

                // Update active state
                const nav = el.closest(".nav, [data-lb-nav-group]");
                if (nav) {
                    nav.querySelectorAll(".active").forEach((a) => a.classList.remove("active"));
                }
                el.classList.add("active");
            };

            el.addEventListener("click", handler);
            el.addEventListener("keydown", handler);

            // Accessibility
            if (!el.getAttribute("tabindex")) el.setAttribute("tabindex", "0");
            if (!el.getAttribute("role")) el.setAttribute("role", "button");
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("nav", NavBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = NavBinder;
    }

})(window);


// ============================================================
// search.js
// ============================================================
/**
 * LiveBlade Feature: Search Binder
 * Debounced search input that updates container
 */

;(function (window) {
    "use strict";

    const SearchBinder = {
        selector: '[data-lb="search"], [data-lb-search]',

        bind(el, LiveBlade) {
            const { debounce } = LiveBlade.utils;

            const doSearch = () => {
                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;
                ctrl.updateParam(el.name || "search", el.value);
                ctrl.resetPage();
                ctrl.refresh();
            };

            const debouncedSearch = debounce(doSearch, LiveBlade.config.debounce);

            el.addEventListener("input", debouncedSearch);

            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    doSearch();
                }
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("search", SearchBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = SearchBinder;
    }

})(window);


// ============================================================
// filter.js
// ============================================================
/**
 * LiveBlade Feature: Filter Binder
 * Handles select, checkbox, radio, and other filter inputs
 */

;(function (window) {
    "use strict";

    const FilterBinder = {
        selector: [
            '[data-lb="filter"]',
            '[data-lb-filter]',
            '[data-lb="select"]',
            '[data-lb="checkbox"]',
            '[data-lb="radio"]',
            '[data-lb="date"]',
            '[data-lb="time"]',
            '[data-lb="datetime-local"]',
            '[data-lb="month"]',
            '[data-lb="week"]',
            '[data-lb="number"]',
            '[data-lb="range"]',
            '[data-lb="color"]'
        ].join(", "),

        bind(el, LiveBlade) {
            const { throttle } = LiveBlade.utils;

            const handleChange = () => {
                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;

                const key = el.name || el.dataset.lbParam || "filter";
                let value;

                if (el.type === "checkbox") {
                    value = el.checked ? (el.value !== "on" ? el.value : "1") : "";
                } else if (el.type === "radio") {
                    value = el.checked ? el.value : "";
                } else {
                    value = el.value;
                }

                ctrl.updateParam(key, value);
                ctrl.resetPage();
                ctrl.refresh();
            };

            const throttledChange = throttle(handleChange, LiveBlade.config.throttle);

            el.addEventListener("change", throttledChange);
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("filter", FilterBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = FilterBinder;
    }

})(window);


// ============================================================
// sort.js
// ============================================================
/**
 * LiveBlade Feature: Sort Binder
 * Clickable table column sorting
 */

;(function (window) {
    "use strict";

    const SortBinder = {
        selector: "[data-lb-sort]",

        bind(el, LiveBlade) {
            const handleSort = () => {
                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;

                const field = el.dataset.lbSort;
                const currentDir = ctrl.params.sort === field && ctrl.params.dir === "asc" ? "desc" : "asc";

                ctrl.updateParam("sort", field);
                ctrl.updateParam("dir", currentDir);
                ctrl.resetPage();

                // Update visual indicators on all sort headers
                const table = el.closest("table");
                if (table) {
                    table.querySelectorAll("[data-lb-sort]").forEach((th) => {
                        th.removeAttribute("aria-sort");
                        th.classList.remove("lb-sort-asc", "lb-sort-desc");
                    });
                }

                // Set current sort indicator
                el.setAttribute("aria-sort", currentDir === "asc" ? "ascending" : "descending");
                el.classList.add(currentDir === "asc" ? "lb-sort-asc" : "lb-sort-desc");

                ctrl.refresh();
            };

            el.addEventListener("click", handleSort);

            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSort();
                }
            });

            // Make sortable and accessible
            el.style.cursor = "pointer";
            if (!el.getAttribute("tabindex")) el.setAttribute("tabindex", "0");
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("sort", SortBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = SortBinder;
    }

})(window);


// ============================================================
// button.js
// ============================================================
/**
 * LiveBlade Feature: Button Binder
 * Refresh and load-more action buttons
 */

;(function (window) {
    "use strict";

    const ButtonBinder = {
        selector: '[data-lb="button"], [data-lb-button], [data-lb-action="refresh"], [data-lb-action="load-more"], [data-lb-action="more"]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            el.addEventListener("click", (e) => {
                e.preventDefault();

                const ctrl = LiveBlade.resolve(el);
                const action = el.dataset.lbAction;

                // Handle refresh action
                if (action === "refresh" && ctrl) {
                    ctrl.refresh();
                    return;
                }

                // Handle load-more action
                if ((action === "load-more" || action === "more") && ctrl) {
                    ctrl.loadMore();
                    return;
                }

                // Handle URL fetch
                const url = el.dataset.lbFetch;
                if (url && sameOrigin(url) && ctrl) {
                    ctrl.setUrl(url);
                    ctrl.refresh();
                }
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("button", ButtonBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = ButtonBinder;
    }

})(window);


// ============================================================
// toggle.js
// ============================================================
/**
 * LiveBlade Feature: Toggle Binder
 * Switch/checkbox that sends POST request on change
 */

;(function (window) {
    "use strict";

    const ToggleBinder = {
        selector: '[data-lb="toggle-update"], [data-lb-toggle]',

        bind(el, LiveBlade) {
            const { sameOrigin, error } = LiveBlade.utils;
            const config = LiveBlade.config;

            el.addEventListener("change", async () => {
                const url = el.dataset.lbFetch || el.dataset.lbToggle;
                if (!url || !sameOrigin(url)) return;

                // Confirmation prompt
                if (el.dataset.lbConfirm && !window.confirm(el.dataset.lbConfirm)) {
                    el.checked = !el.checked;
                    return;
                }

                const wrapper = el.closest(".form-check, .form-switch, .lb-toggle");
                const originalChecked = !el.checked;

                if (wrapper) wrapper.classList.add("lb-updating");
                el.disabled = true;

                try {
                    const response = await fetch(url, {
                        method: el.dataset.lbMethod || "POST",
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.getCsrf(),
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        },
                        body: JSON.stringify({ [el.name || "value"]: el.checked ? 1 : 0 }),
                        credentials: "same-origin"
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    el.disabled = false;

                    if (wrapper) {
                        wrapper.classList.remove("lb-updating");
                        wrapper.classList.add("lb-success");
                        setTimeout(() => wrapper.classList.remove("lb-success"), config.successDuration);
                    }

                    // Refresh container if configured
                    const ctrl = LiveBlade.resolve(el);
                    if (ctrl && el.dataset.lbRefresh !== "false") ctrl.refresh();

                    LiveBlade.emit("toggle:success", { el, checked: el.checked });

                } catch (err) {
                    // Revert on error
                    el.checked = originalChecked;
                    el.disabled = false;

                    if (wrapper) {
                        wrapper.classList.remove("lb-updating");
                        wrapper.classList.add("lb-error");
                        setTimeout(() => wrapper.classList.remove("lb-error"), config.errorDuration);
                    }

                    error("Toggle failed:", err);
                    LiveBlade.emit("toggle:error", { el, error: err });
                }
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("toggle", ToggleBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = ToggleBinder;
    }

})(window);


// ============================================================
// data.js
// ============================================================
/**
 * LiveBlade Feature: Data Binder
 * Displays live JSON data with optional auto-refresh
 */

;(function (window) {
    "use strict";

    const DataBinder = {
        selector: '[data-lb="data"], [data-lb-data]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            const url = el.dataset.lbFetch || el.dataset.lbData;
            if (!url || !sameOrigin(url)) return;

            const update = async () => {
                try {
                    const response = await fetch(url, {
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.getCsrf(),
                            "Accept": "application/json"
                        },
                        credentials: "same-origin"
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const data = await response.json();

                    // Try to find the value in various places
                    const value = data?.value ?? data?.count ?? data?.total ??
                        Object.values(data || {}).find((v) => typeof v === "number" || typeof v === "string");

                    if (value !== undefined) {
                        el.textContent = value;
                        el.classList.remove("lb-data-error");
                    }

                    LiveBlade.emit("data:updated", { el, data });

                } catch (err) {
                    el.classList.add("lb-data-error");
                    if (!el.textContent) el.textContent = "—";
                    LiveBlade.emit("data:error", { el, error: err });
                }
            };

            // Initial fetch
            update();

            // Set up interval if configured
            const interval = parseInt(el.dataset.lbInterval, 10);
            if (interval > 0) {
                el._lbDataTimer = setInterval(update, interval * 1000);
            }
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("data", DataBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = DataBinder;
    }

})(window);


// ============================================================
// pagination.js
// ============================================================
/**
 * LiveBlade Feature: Pagination Binder
 * Handles pagination link clicks within a container
 */

;(function (window) {
    "use strict";

    const PaginationBinder = {
        selector: '[data-lb="pagination"], [data-lb-pagination]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            el.addEventListener("click", (e) => {
                // Find the clicked link
                let link = e.target;
                if (link.tagName !== "A") link = link.closest("a");

                // Validate link
                if (!link?.href || link.href === "#" || link.classList.contains("disabled")) return;

                e.preventDefault();
                e.stopPropagation();

                const ctrl = LiveBlade.resolve(el);
                if (!ctrl || !sameOrigin(link.href)) return;

                ctrl.setUrl(link.href);
                ctrl.navigate();
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("pagination", PaginationBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = PaginationBinder;
    }

})(window);


// ============================================================
// quick-search.js
// ============================================================
/**
 * LiveBlade Feature: Quick Search
 * Autocomplete/typeahead search with dropdown results
 *
 * Usage:
 *   <input data-lb-quick-search="/users/search" data-lb-target="#results" data-lb-min="2">
 *   <div id="results"></div>
 *
 * Options (data attributes):
 *   data-lb-quick-search  - URL to fetch results (required)
 *   data-lb-target        - Selector for results container (required)
 *   data-lb-min           - Minimum characters to trigger search (default: 1)
 *   data-lb-delay         - Debounce delay in ms (default: 300)
 *   data-lb-param         - Query parameter name (default: "q")
 *   data-lb-hidden        - Selector for hidden input to store selected ID
 *   data-lb-display       - Property to display in input after selection (default: "title")
 *   data-lb-template      - Template: "default" or "avatar" (default: "default")
 *
 * Server Response (JSON array):
 *   [{ "id": 1, "title": "John Doe", "subtitle": "john@example.com", "picture": "/img/john.jpg" }, ...]
 * 
 * Supported field names (in priority order):
 *   - id: id
 *   - title: title, text, name, label
 *   - subtitle: subtitle, description, email
 *   - picture: picture, avatar, image, img
 */

;(function (window, document) {
    "use strict";

    /**
     * Get title from item (supports multiple field names)
     */
    function getTitle(item) {
        return item.title ?? item.text ?? item.name ?? item.label ?? '';
    }

    /**
     * Get subtitle from item
     */
    function getSubtitle(item) {
        return item.subtitle ?? item.description ?? item.email ?? '';
    }

    /**
     * Get picture from item
     */
    function getPicture(item) {
        return item.picture ?? item.avatar ?? item.image ?? item.img ?? '';
    }

    /**
     * Default item renderer (title + subtitle, no picture)
     */
    function renderDefault(item) {
        const title = getTitle(item);
        const subtitle = getSubtitle(item);
        
        let html = `<div class="lb-qs-content">`;
        html += `<div class="lb-qs-title">${escapeHtml(title)}</div>`;
        if (subtitle) {
            html += `<div class="lb-qs-subtitle">${escapeHtml(subtitle)}</div>`;
        }
        html += `</div>`;
        return html;
    }

    /**
     * Avatar item renderer (picture + title + subtitle)
     */
    function renderAvatar(item) {
        const title = getTitle(item);
        const subtitle = getSubtitle(item);
        const picture = getPicture(item);
        const initials = title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        let pictureHtml;
        if (picture) {
            pictureHtml = `<img src="${escapeHtml(picture)}" alt="" class="lb-qs-picture">`;
        } else {
            pictureHtml = `<div class="lb-qs-picture lb-qs-initials">${initials}</div>`;
        }

        let html = `
            ${pictureHtml}
            <div class="lb-qs-content">
                <div class="lb-qs-title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="lb-qs-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            </div>
        `;
        return html;
    }

    /**
     * Escape HTML
     */
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Quick Search Controller
     */
    function QuickSearchController(input, LiveBlade) {
        this.input = input;
        this.LiveBlade = LiveBlade;
        this.url = input.dataset.lbQuickSearch;
        this.targetSelector = input.dataset.lbTarget;
        this.target = document.querySelector(this.targetSelector);
        this.minChars = parseInt(input.dataset.lbMin, 10) || 1;
        this.delay = parseInt(input.dataset.lbDelay, 10) || 300;
        this.paramName = input.dataset.lbParam || 'q';
        this.hiddenSelector = input.dataset.lbHidden;
        this.displayProp = input.dataset.lbDisplay || 'title';
        this.template = input.dataset.lbTemplate || 'default';

        this.abortController = null;
        this.debounceTimer = null;
        this.selectedIndex = -1;
        this.items = [];
        this.isOpen = false;

        this._init();
    }

    QuickSearchController.prototype._init = function () {
        if (!this.target) {
            this.LiveBlade.utils.warn('Quick Search: Target not found:', this.targetSelector);
            return;
        }

        // Add classes
        this.target.classList.add('lb-quick-search-results');
        this.input.classList.add('lb-quick-search-input');

        // Wrap in container for positioning if not already
        if (!this.input.parentElement.classList.contains('lb-quick-search-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'lb-quick-search-wrapper';
            this.input.parentNode.insertBefore(wrapper, this.input);
            wrapper.appendChild(this.input);
            wrapper.appendChild(this.target);
        }

        // Event listeners
        this.input.addEventListener('input', this._onInput.bind(this));
        this.input.addEventListener('keydown', this._onKeydown.bind(this));
        this.input.addEventListener('focus', this._onFocus.bind(this));
        this.input.addEventListener('blur', this._onBlur.bind(this));
        this.target.addEventListener('mousedown', this._onResultClick.bind(this));

        // ARIA attributes
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute('aria-autocomplete', 'list');
        this.input.setAttribute('aria-expanded', 'false');
        this.target.setAttribute('role', 'listbox');
    };

    QuickSearchController.prototype._onInput = function (e) {
        const query = e.target.value.trim();

        // Clear selection
        this._clearHidden();

        if (query.length < this.minChars) {
            this._hideResults();
            return;
        }

        // Debounce
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this._search(query), this.delay);
    };

    QuickSearchController.prototype._onKeydown = function (e) {
        if (!this.isOpen) {
            if (e.key === 'ArrowDown' && this.input.value.length >= this.minChars) {
                this._search(this.input.value.trim());
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this._navigate(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._navigate(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this._selectItem(this.items[this.selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this._hideResults();
                break;
            case 'Tab':
                this._hideResults();
                break;
        }
    };

    QuickSearchController.prototype._onFocus = function () {
        if (this.items.length > 0 && this.input.value.length >= this.minChars) {
            this._showResults();
        }
    };

    QuickSearchController.prototype._onBlur = function () {
        // Delay to allow click on results
        setTimeout(() => this._hideResults(), 150);
    };

    QuickSearchController.prototype._onResultClick = function (e) {
        const item = e.target.closest('.lb-qs-item');
        if (!item) return;

        e.preventDefault();
        const index = parseInt(item.dataset.index, 10);
        if (this.items[index]) {
            this._selectItem(this.items[index]);
        }
    };

    QuickSearchController.prototype._search = async function (query) {
        // Abort previous request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // Build URL
        const url = new URL(this.url, window.location.href);
        url.searchParams.set(this.paramName, query);

        // Show loading state
        this.input.classList.add('lb-qs-loading');

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': this.LiveBlade.getCsrf()
                },
                credentials: 'same-origin',
                signal: this.abortController.signal
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.items = Array.isArray(data) ? data : (data.data ?? data.results ?? data.items ?? []);

            this._renderResults();
            this._showResults();

            this.LiveBlade.emit('quicksearch:results', { input: this.input, query, items: this.items });

        } catch (err) {
            if (err.name === 'AbortError') return;
            this.LiveBlade.utils.error('Quick Search error:', err);
            this._hideResults();
        } finally {
            this.input.classList.remove('lb-qs-loading');
        }
    };

    QuickSearchController.prototype._renderResults = function () {
        if (this.items.length === 0) {
            this.target.innerHTML = '<div class="lb-qs-empty">No results found</div>';
            return;
        }

        const renderer = this.template === 'avatar' ? renderAvatar : renderDefault;

        this.target.innerHTML = this.items.map((item, index) => {
            const content = renderer(item);
            return `
                <div class="lb-qs-item" data-index="${index}" data-id="${escapeHtml(item.id ?? '')}" role="option">
                    ${content}
                </div>
            `;
        }).join('');

        this.selectedIndex = -1;
    };

    QuickSearchController.prototype._navigate = function (direction) {
        const items = this.target.querySelectorAll('.lb-qs-item');
        if (items.length === 0) return;

        // Remove current highlight
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
            items[this.selectedIndex].classList.remove('lb-qs-active');
        }

        // Calculate new index
        this.selectedIndex += direction;
        if (this.selectedIndex < 0) this.selectedIndex = items.length - 1;
        if (this.selectedIndex >= items.length) this.selectedIndex = 0;

        // Highlight new item
        const active = items[this.selectedIndex];
        active.classList.add('lb-qs-active');
        active.scrollIntoView({ block: 'nearest' });

        this.input.setAttribute('aria-activedescendant', `lb-qs-item-${this.selectedIndex}`);
    };

    QuickSearchController.prototype._selectItem = function (item) {
        // Get display value (title is primary)
        const displayValue = item[this.displayProp] ?? item.title ?? item.text ?? item.name ?? item.label ?? '';

        // Set input value
        this.input.value = displayValue;

        // Set hidden input if configured
        if (this.hiddenSelector) {
            const hidden = document.querySelector(this.hiddenSelector);
            if (hidden) {
                hidden.value = item.id ?? '';
            }
        }

        this._hideResults();

        // Emit event
        this.LiveBlade.emit('quicksearch:select', { input: this.input, item });

        // Dispatch DOM event
        this.input.dispatchEvent(new CustomEvent('lb:quicksearch:select', {
            detail: { item },
            bubbles: true
        }));
    };

    QuickSearchController.prototype._showResults = function () {
        if (this.items.length === 0 && !this.target.innerHTML) return;

        this.target.classList.add('lb-qs-open');
        this.input.setAttribute('aria-expanded', 'true');
        this.isOpen = true;
    };

    QuickSearchController.prototype._hideResults = function () {
        this.target.classList.remove('lb-qs-open');
        this.input.setAttribute('aria-expanded', 'false');
        this.isOpen = false;
        this.selectedIndex = -1;
    };

    QuickSearchController.prototype._clearHidden = function () {
        if (this.hiddenSelector) {
            const hidden = document.querySelector(this.hiddenSelector);
            if (hidden) hidden.value = '';
        }
    };

    QuickSearchController.prototype.clear = function () {
        this.input.value = '';
        this._clearHidden();
        this._hideResults();
        this.items = [];
    };

    /**
     * Feature registration
     */
    const QuickSearchFeature = {
        init(LiveBlade) {
            LiveBlade.QuickSearchController = QuickSearchController;
        }
    };

    /**
     * Quick Search Binder
     */
    const QuickSearchBinder = {
        selector: '[data-lb-quick-search]',

        bind(el, LiveBlade) {
            if (el._lbQuickSearch) return;
            el._lbQuickSearch = new QuickSearchController(el, LiveBlade);
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('quick-search', QuickSearchFeature);
        window.LiveBlade.registerBinder('quick-search', QuickSearchBinder);
    }

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { QuickSearchController, QuickSearchFeature, QuickSearchBinder };
    }

})(window, document);
