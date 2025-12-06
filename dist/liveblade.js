/*!
 * LiveBlade v1.0.2
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
 *   - cascade
 *   - confirm
 *   - rating
 *   - word-counter
 *   - forms
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

// ============================================================
// cascade.js
// ============================================================
/**
 * LiveBlade Feature: Cascade Select
 * Cascading/dependent dropdowns that load options from API
 *
 * Usage:
 *   <!-- Parent -->
 *   <select data-lb-cascade 
 *           data-lb-fetch="/api/countries/{value}/states" 
 *           data-lb-target="#state-select"
 *           data-lb-loading="Loading states..."
 *           name="country">
 *       <option value="">Select Country</option>
 *       <option value="CA">Canada</option>
 *       <option value="US">United States</option>
 *   </select>
 *
 *   <!-- Child -->
 *   <select id="state-select" name="state">
 *       <option value="">Select State</option>
 *   </select>
 *
 * Options (data attributes):
 *   data-lb-cascade       - Marks this as a cascade parent (required)
 *   data-lb-fetch         - URL with {value} placeholder (required)
 *   data-lb-target        - Selector for child select (required)
 *   data-lb-placeholder   - Placeholder text for child (default: "Select...")
 *   data-lb-loading       - Loading text (default: "Loading...")
 *   data-lb-error         - Error text (default: "Error loading options")
 *   data-lb-value-field   - JSON field for option value (default: "id")
 *   data-lb-text-field    - JSON field for option text (default: "name")
 *   data-lb-selected      - Pre-select this value after loading
 *
 * Server Response (JSON array):
 *   [{ "id": "QC", "name": "Quebec" }, { "id": "ON", "name": "Ontario" }]
 *
 * Events:
 *   lb:cascade:loading  - When fetch starts
 *   lb:cascade:loaded   - When options are loaded
 *   lb:cascade:error    - When fetch fails
 *   lb:cascade:reset    - When child is reset
 */

;(function (window, document) {
    "use strict";

    /**
     * Cascade Controller
     */
    function CascadeController(el, LiveBlade) {
        this.parent = el;
        this.LiveBlade = LiveBlade;
        this.urlTemplate = el.dataset.lbFetch;
        this.targetSelector = el.dataset.lbTarget;
        this.child = document.querySelector(this.targetSelector);
        
        // Options
        this.placeholder = el.dataset.lbPlaceholder || 'Select...';
        this.loadingText = el.dataset.lbLoading || 'Loading...';
        this.errorText = el.dataset.lbError || 'Error loading options';
        this.valueField = el.dataset.lbValueField || 'id';
        this.textField = el.dataset.lbTextField || 'name';
        this.preselectedValue = el.dataset.lbSelected || null;
        
        // State
        this.abortController = null;
        this.originalPlaceholder = null;
        this.cache = {};

        this._init();
    }

    CascadeController.prototype._init = function () {
        if (!this.child) {
            console.warn('LiveBlade Cascade: Target not found:', this.targetSelector);
            return;
        }

        if (!this.urlTemplate) {
            console.warn('LiveBlade Cascade: data-lb-fetch is required');
            return;
        }

        // Store original placeholder from child's first option
        if (this.child.options.length > 0 && this.child.options[0].value === '') {
            this.originalPlaceholder = this.child.options[0].text;
        } else {
            this.originalPlaceholder = this.placeholder;
        }

        // Initial state - disable child if parent has no value
        if (!this.parent.value) {
            this._resetChild();
        } else {
            // Parent has initial value, load child options
            this._loadOptions(this.parent.value);
        }

        // Listen for parent changes
        this.parent.addEventListener('change', this._onChange.bind(this));
    };

    CascadeController.prototype._onChange = function (e) {
        const value = e.target.value;

        if (!value) {
            this._resetChild();
            return;
        }

        this._loadOptions(value);
    };

    CascadeController.prototype._loadOptions = async function (value) {
        // Check cache first
        if (this.cache[value]) {
            this._populateOptions(this.cache[value]);
            return;
        }

        // Abort previous request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // Build URL
        const url = this.urlTemplate.replace('{value}', encodeURIComponent(value));

        // Show loading state
        this._setLoading(true);

        // Emit loading event
        this._emit('lb:cascade:loading', { parent: this.parent, child: this.child, value });

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': this.LiveBlade.getCsrf()
                },
                credentials: 'same-origin',
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Handle different response formats
            const options = Array.isArray(data) ? data : (data.data ?? data.options ?? data.items ?? []);

            // Cache the results
            this.cache[value] = options;

            // Populate child select
            this._populateOptions(options);

            // Emit loaded event
            this._emit('lb:cascade:loaded', { 
                parent: this.parent, 
                child: this.child, 
                value, 
                options 
            });

        } catch (err) {
            if (err.name === 'AbortError') return;

            console.error('LiveBlade Cascade error:', err);
            this._setError();

            // Emit error event
            this._emit('lb:cascade:error', { 
                parent: this.parent, 
                child: this.child, 
                error: err 
            });
        }
    };

    CascadeController.prototype._populateOptions = function (options) {
        // Clear existing options
        this.child.innerHTML = '';

        // Add placeholder
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = this.originalPlaceholder;
        this.child.appendChild(placeholder);

        // Add options
        options.forEach(item => {
            const option = document.createElement('option');
            option.value = item[this.valueField] ?? item.id ?? item.value ?? '';
            option.textContent = item[this.textField] ?? item.name ?? item.text ?? item.label ?? '';
            
            // Check for preselected value
            if (this.preselectedValue && option.value === this.preselectedValue) {
                option.selected = true;
                // Clear preselected after first use (for subsequent changes)
                this.preselectedValue = null;
            }
            
            this.child.appendChild(option);
        });

        // Enable child
        this.child.disabled = false;
        this.child.classList.remove('lb-cascade-loading', 'lb-cascade-error');

        // Trigger change event on child if value was preselected
        if (this.child.value) {
            this.child.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    CascadeController.prototype._resetChild = function () {
        // Clear options
        this.child.innerHTML = '';

        // Add placeholder
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = this.originalPlaceholder;
        this.child.appendChild(placeholder);

        // Disable child
        this.child.disabled = true;
        this.child.classList.remove('lb-cascade-loading', 'lb-cascade-error');

        // Emit reset event
        this._emit('lb:cascade:reset', { parent: this.parent, child: this.child });

        // If child is also a cascade parent, reset its children too
        if (this.child.dataset.lbCascade !== undefined) {
            this.child.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    CascadeController.prototype._setLoading = function (loading) {
        if (loading) {
            this.child.disabled = true;
            this.child.classList.add('lb-cascade-loading');
            this.child.classList.remove('lb-cascade-error');

            // Show loading text
            this.child.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = this.loadingText;
            this.child.appendChild(option);
        }
    };

    CascadeController.prototype._setError = function () {
        this.child.disabled = true;
        this.child.classList.remove('lb-cascade-loading');
        this.child.classList.add('lb-cascade-error');

        // Show error text
        this.child.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = this.errorText;
        this.child.appendChild(option);
    };

    CascadeController.prototype._emit = function (eventName, detail) {
        this.parent.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true
        }));

        this.child.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true
        }));
    };

    /**
     * Public method to clear cache
     */
    CascadeController.prototype.clearCache = function () {
        this.cache = {};
    };

    /**
     * Public method to reload current selection
     */
    CascadeController.prototype.reload = function () {
        const value = this.parent.value;
        if (value) {
            delete this.cache[value];
            this._loadOptions(value);
        }
    };

    /**
     * Feature registration
     */
    const CascadeFeature = {
        init(LiveBlade) {
            LiveBlade.CascadeController = CascadeController;
        }
    };

    /**
     * Cascade Binder
     */
    const CascadeBinder = {
        selector: '[data-lb-cascade]',

        bind(el, LiveBlade) {
            if (el._lbCascade) return;
            el._lbCascade = new CascadeController(el, LiveBlade);
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('cascade', CascadeFeature);
        window.LiveBlade.registerBinder('cascade', CascadeBinder);
    }

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CascadeController, CascadeFeature, CascadeBinder };
    }

})(window, document);

// ============================================================
// confirm.js
// ============================================================
/**
 * LiveBlade Feature: Confirm Action
 * "Are you sure?" confirmation before actions with server-driven responses
 *
 * Usage:
 *   <!-- Basic confirm with remove -->
 *   <button data-lb-confirm="Delete this item?" 
 *           data-lb-fetch="/items/1/delete" 
 *           data-lb-method="DELETE"
 *           data-lb-remove="#item-1">
 *       Delete
 *   </button>
 *
 *   <!-- Confirm with replace (status change) -->
 *   <button data-lb-confirm="Approve this order?" 
 *           data-lb-fetch="/orders/1/approve" 
 *           data-lb-method="POST"
 *           data-lb-replace="#order-1">
 *       Approve
 *   </button>
 *
 *   <!-- With target refresh -->
 *   <button data-lb-confirm="Remove from list?" 
 *           data-lb-fetch="/items/1/remove" 
 *           data-lb-method="POST"
 *           data-lb-refresh="#items-list">
 *       Remove
 *   </button>
 *
 *   <!-- Link with confirm -->
 *   <a href="/logout" data-lb-confirm="Are you sure you want to logout?">
 *       Logout
 *   </a>
 *
 * Options (data attributes):
 *   data-lb-confirm       - Confirmation message (required)
 *   data-lb-fetch         - URL to call on confirm (optional, uses href if not set)
 *   data-lb-method        - HTTP method: GET, POST, PUT, DELETE (default: POST)
 *   data-lb-remove        - Remove this element on success
 *   data-lb-replace       - Replace this element with server HTML
 *   data-lb-refresh       - Refresh these container(s) on success
 *   data-lb-redirect      - Redirect to URL on success
 *   data-lb-fade          - Fade out element after ms
 *   data-lb-confirm-yes   - Text for confirm button (default: "Yes")
 *   data-lb-confirm-no    - Text for cancel button (default: "Cancel")
 *   data-lb-confirm-title - Title for dialog (default: "Confirm")
 *
 * Server Response Format (optional - can also use HTML attributes):
 *   {
 *       "success": true,
 *       "message": "Order approved!",
 *       "html": "<tr>...</tr>",
 *       "action": {
 *           "type": "replace",
 *           "target": "#order-1",
 *           "fade": 3000
 *       }
 *   }
 *
 * Events:
 *   lb:confirm:show      - Before dialog shows
 *   lb:confirm:cancel    - When user cancels
 *   lb:confirm:confirmed - When user confirms (before fetch)
 *   lb:confirm:success   - After successful action
 *   lb:confirm:error     - On error
 */

;(function (window, document) {
    "use strict";

    // Modal HTML template
    const modalTemplate = `
        <div class="lb-confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="lb-confirm-title">
            <div class="lb-confirm-dialog">
                <div class="lb-confirm-header">
                    <h4 id="lb-confirm-title" class="lb-confirm-title"></h4>
                </div>
                <div class="lb-confirm-body">
                    <p class="lb-confirm-message"></p>
                </div>
                <div class="lb-confirm-footer">
                    <button type="button" class="lb-confirm-btn lb-confirm-btn-cancel"></button>
                    <button type="button" class="lb-confirm-btn lb-confirm-btn-yes"></button>
                </div>
            </div>
        </div>
    `;

    let modalElement = null;
    let currentCallback = null;

    /**
     * Create modal if not exists
     */
    function ensureModal() {
        if (modalElement) return modalElement;

        const div = document.createElement('div');
        div.innerHTML = modalTemplate.trim();
        modalElement = div.firstChild;
        document.body.appendChild(modalElement);

        // Event listeners
        const cancelBtn = modalElement.querySelector('.lb-confirm-btn-cancel');
        const yesBtn = modalElement.querySelector('.lb-confirm-btn-yes');
        const overlay = modalElement;

        cancelBtn.addEventListener('click', () => hideModal(false));
        yesBtn.addEventListener('click', () => hideModal(true));

        // Click outside to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) hideModal(false);
        });

        // Escape key to cancel
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalElement.classList.contains('lb-confirm-show')) {
                hideModal(false);
            }
        });

        return modalElement;
    }

    /**
     * Show confirmation dialog
     */
    function showModal(options, callback) {
        const modal = ensureModal();
        currentCallback = callback;

        // Set content
        modal.querySelector('.lb-confirm-title').textContent = options.title || 'Confirm';
        modal.querySelector('.lb-confirm-message').textContent = options.message;
        modal.querySelector('.lb-confirm-btn-cancel').textContent = options.cancelText || 'Cancel';
        modal.querySelector('.lb-confirm-btn-yes').textContent = options.confirmText || 'Yes';

        // Show
        modal.classList.add('lb-confirm-show');
        modal.querySelector('.lb-confirm-btn-yes').focus();

        // Prevent body scroll
        document.body.style.overflow = 'hidden';
    }

    /**
     * Hide modal and call callback
     */
    function hideModal(confirmed) {
        if (!modalElement) return;

        modalElement.classList.remove('lb-confirm-show');
        document.body.style.overflow = '';

        if (currentCallback) {
            currentCallback(confirmed);
            currentCallback = null;
        }
    }

    /**
     * Fade out and remove element
     */
    function fadeOutAndRemove(element) {
        element.classList.add('lb-row-removing');
        
        element.addEventListener('animationend', () => {
            element.remove();
        }, { once: true });

        // Fallback removal if animation doesn't fire
        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
        }, 500);
    }

    /**
     * Replace element with new HTML
     */
    function replaceHtml(selector, html, fade) {
        const target = document.querySelector(selector);
        if (!target) return;

        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        const newElement = temp.firstElementChild;

        if (newElement) {
            newElement.classList.add('lb-row-updated');
            target.replaceWith(newElement);

            setTimeout(() => {
                newElement.classList.remove('lb-row-updated');
            }, 1000);

            if (fade) {
                setTimeout(() => fadeOutAndRemove(newElement), fade);
            }

            // Re-bind LiveBlade on new content
            if (window.LiveBlade && window.LiveBlade.bind) {
                window.LiveBlade.bind(newElement);
            }
        }
    }

    /**
     * Remove element with animation
     */
    function removeElement(selector) {
        const target = document.querySelector(selector);
        if (target) {
            fadeOutAndRemove(target);
        }
    }

    /**
     * Refresh target containers
     */
    function refreshTargets(selectors, LiveBlade) {
        const targets = selectors.split(',').map(s => s.trim());
        targets.forEach(selector => {
            const target = document.querySelector(selector);
            if (target && LiveBlade.refresh) {
                LiveBlade.refresh(selector);
            }
        });
    }

    /**
     * Show toast message
     */
    function showToast(message, type = 'success', LiveBlade) {
        if (LiveBlade.toast) {
            LiveBlade.toast(message, type);
            return;
        }

        // Use forms toast if available
        if (LiveBlade.forms && LiveBlade.forms.showToast) {
            LiveBlade.forms.showToast(message, type);
            return;
        }

        // Fallback: create simple toast
        const toast = document.createElement('div');
        toast.className = `lb-toast lb-toast-${type}`;
        toast.textContent = message;
        
        let container = document.querySelector('.lb-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'lb-toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);
        setTimeout(() => toast.classList.add('lb-toast-show'), 10);
        setTimeout(() => {
            toast.classList.remove('lb-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Get fallback action from HTML attributes
     */
    function getFallbackAction(el) {
        const action = {};

        if (el.dataset.lbRemove) {
            action.type = 'remove';
            action.target = el.dataset.lbRemove;
        } else if (el.dataset.lbReplace) {
            action.type = 'replace';
            action.target = el.dataset.lbReplace;
        } else if (el.dataset.lbRefresh) {
            action.type = 'refresh';
            action.target = el.dataset.lbRefresh;
        } else if (el.dataset.lbRedirect) {
            action.type = 'redirect';
            action.redirect = el.dataset.lbRedirect;
        } else if (el.dataset.lbTarget) {
            // Legacy support
            action.type = 'refresh';
            action.target = el.dataset.lbTarget;
        }

        if (el.dataset.lbFade) {
            action.fade = parseInt(el.dataset.lbFade, 10);
        }

        return action.type ? action : null;
    }

    /**
     * Process action from server or fallback
     */
    function processAction(action, html, el, LiveBlade) {
        if (!action || !action.type) return;

        switch (action.type) {
            case 'remove':
                if (action.target) removeElement(action.target);
                break;
            case 'replace':
                if (action.target && html) replaceHtml(action.target, html, action.fade);
                break;
            case 'refresh':
                if (action.target) refreshTargets(action.target, LiveBlade);
                break;
            case 'redirect':
                if (action.redirect) window.location.href = action.redirect;
                break;
            case 'remove-multiple':
                if (action.targets) action.targets.forEach(t => removeElement(t));
                break;
            case 'replace-multiple':
                if (action.items) {
                    action.items.forEach(item => {
                        if (item.target && item.html) {
                            replaceHtml(item.target, item.html, item.fade || action.fade);
                        }
                    });
                }
                break;
        }
    }

    /**
     * Handle confirm action
     */
    async function handleConfirm(el, LiveBlade) {
        const message = el.dataset.lbConfirm;
        const url = el.dataset.lbFetch || el.getAttribute('href');
        const method = (el.dataset.lbMethod || 'POST').toUpperCase();
        const title = el.dataset.lbConfirmTitle;
        const confirmText = el.dataset.lbConfirmYes;
        const cancelText = el.dataset.lbConfirmNo;

        // Emit show event
        const showEvent = new CustomEvent('lb:confirm:show', {
            detail: { element: el, message },
            bubbles: true,
            cancelable: true
        });
        el.dispatchEvent(showEvent);
        if (showEvent.defaultPrevented) return;

        // Show confirmation dialog
        showModal({
            title,
            message,
            confirmText,
            cancelText
        }, async (confirmed) => {
            if (!confirmed) {
                el.dispatchEvent(new CustomEvent('lb:confirm:cancel', {
                    detail: { element: el },
                    bubbles: true
                }));
                return;
            }

            // Emit confirmed event
            el.dispatchEvent(new CustomEvent('lb:confirm:confirmed', {
                detail: { element: el, url, method },
                bubbles: true
            }));

            // If no URL, just follow the link (for simple confirmations)
            if (!url) return;

            // If it's a GET with href and no fetch, just navigate
            if (method === 'GET' && !el.dataset.lbFetch && el.getAttribute('href')) {
                window.location.href = el.getAttribute('href');
                return;
            }

            // Add loading state
            el.classList.add('lb-confirm-loading');
            el.disabled = true;

            try {
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                        'X-CSRF-TOKEN': LiveBlade.getCsrf()
                    },
                    credentials: 'same-origin'
                });

                const data = await response.json();

                if (!response.ok || data.success === false) {
                    throw new Error(data.error || data.message || `HTTP ${response.status}`);
                }

                // Success!
                el.classList.remove('lb-confirm-loading');
                el.classList.add('lb-confirm-success');

                // Determine action: server response takes priority
                const serverAction = data.action || {};
                const fallbackAction = getFallbackAction(el) || {};
                const action = { ...fallbackAction, ...serverAction };

                // Process the action
                processAction(action, data.html, el, LiveBlade);

                // Show success message
                if (data.message) {
                    showToast(data.message, 'success', LiveBlade);
                }

                // Emit success event
                el.dispatchEvent(new CustomEvent('lb:confirm:success', {
                    detail: { element: el, data, action },
                    bubbles: true
                }));

                // Remove success state after delay
                setTimeout(() => {
                    el.classList.remove('lb-confirm-success');
                    el.disabled = false;
                }, 1500);

            } catch (err) {
                console.error('Confirm action error:', err);

                el.classList.remove('lb-confirm-loading');
                el.classList.add('lb-confirm-error');
                el.disabled = false;

                // Show error toast
                showToast(err.message || 'An error occurred', 'error', LiveBlade);

                // Emit error event
                el.dispatchEvent(new CustomEvent('lb:confirm:error', {
                    detail: { element: el, error: err },
                    bubbles: true
                }));

                // Remove error state after delay
                setTimeout(() => {
                    el.classList.remove('lb-confirm-error');
                }, 2000);
            }
        });
    }

    /**
     * Confirm Binder
     */
    const ConfirmBinder = {
        selector: '[data-lb-confirm]',

        bind(el, LiveBlade) {
            if (el._lbConfirm) return;
            el._lbConfirm = true;

            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleConfirm(el, LiveBlade);
            });
        }
    };

    /**
     * Feature registration
     */
    const ConfirmFeature = {
        init(LiveBlade) {
            // Expose confirm method for programmatic use
            LiveBlade.confirm = function(message, options = {}) {
                return new Promise((resolve) => {
                    showModal({
                        message,
                        title: options.title,
                        confirmText: options.confirmText || options.yes,
                        cancelText: options.cancelText || options.no
                    }, resolve);
                });
            };
        }
    };

    // Register
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('confirm', ConfirmFeature);
        window.LiveBlade.registerBinder('confirm', ConfirmBinder);
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { ConfirmFeature, ConfirmBinder };
    }

})(window, document);

// ============================================================
// rating.js
// ============================================================
/**
 * LiveBlade Feature: Star Rating
 * Interactive star rating with optional POST to server
 *
 * Usage:
 *   <!-- Basic (display only) -->
 *   <div data-lb-rating data-lb-value="3"></div>
 *
 *   <!-- Interactive with POST -->
 *   <div data-lb-rating 
 *        data-lb-value="3" 
 *        data-lb-fetch="/products/1/rate"
 *        data-lb-param="rating">
 *   </div>
 *
 *   <!-- Custom max stars -->
 *   <div data-lb-rating data-lb-value="7" data-lb-max="10"></div>
 *
 *   <!-- Read-only -->
 *   <div data-lb-rating data-lb-value="4.5" data-lb-readonly></div>
 *
 * Options (data attributes):
 *   data-lb-rating    - Marks as rating component (required)
 *   data-lb-value     - Current rating value (default: 0)
 *   data-lb-max       - Maximum stars (default: 5)
 *   data-lb-fetch     - URL to POST rating (optional)
 *   data-lb-param     - Parameter name for rating (default: "rating")
 *   data-lb-readonly  - Disable interaction
 *   data-lb-half      - Allow half-star ratings
 *   data-lb-size      - Size: "sm", "md", "lg" (default: "md")
 *
 * Events:
 *   lb:rating:change  - When rating changes (before POST)
 *   lb:rating:success - After successful POST
 *   lb:rating:error   - On POST error
 */

;(function (window, document) {
    "use strict";

    // Star SVG icons
    const starFull = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    const starEmpty = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    const starHalf = `<svg viewBox="0 0 24 24"><defs><linearGradient id="half"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path fill="url(#half)" stroke="currentColor" stroke-width="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

    /**
     * Rating Controller
     */
    function RatingController(el, LiveBlade) {
        this.container = el;
        this.LiveBlade = LiveBlade;
        this.value = parseFloat(el.dataset.lbValue) || 0;
        this.max = parseInt(el.dataset.lbMax, 10) || 5;
        this.url = el.dataset.lbFetch;
        this.paramName = el.dataset.lbParam || 'rating';
        this.readonly = el.hasAttribute('data-lb-readonly');
        this.allowHalf = el.hasAttribute('data-lb-half');
        this.size = el.dataset.lbSize || 'md';
        this.hoverValue = null;

        this._init();
    }

    RatingController.prototype._init = function () {
        // Add classes
        this.container.classList.add('lb-rating');
        this.container.classList.add('lb-rating-' + this.size);
        if (this.readonly) {
            this.container.classList.add('lb-rating-readonly');
        }

        // Create stars
        this._render();

        // Event listeners (if not readonly)
        if (!this.readonly) {
            this.container.addEventListener('mousemove', this._onMouseMove.bind(this));
            this.container.addEventListener('mouseleave', this._onMouseLeave.bind(this));
            this.container.addEventListener('click', this._onClick.bind(this));
            this.container.addEventListener('keydown', this._onKeyDown.bind(this));
            this.container.setAttribute('tabindex', '0');
            this.container.setAttribute('role', 'slider');
            this.container.setAttribute('aria-valuemin', '0');
            this.container.setAttribute('aria-valuemax', this.max.toString());
            this.container.setAttribute('aria-valuenow', this.value.toString());
            this.container.setAttribute('aria-label', 'Rating');
        }
    };

    RatingController.prototype._render = function () {
        const displayValue = this.hoverValue !== null ? this.hoverValue : this.value;
        let html = '';

        for (let i = 1; i <= this.max; i++) {
            const starClass = 'lb-rating-star';
            let starIcon;

            if (displayValue >= i) {
                starIcon = starFull;
            } else if (this.allowHalf && displayValue >= i - 0.5) {
                starIcon = starHalf;
            } else {
                starIcon = starEmpty;
            }

            html += `<span class="${starClass}" data-value="${i}">${starIcon}</span>`;
        }

        this.container.innerHTML = html;
    };

    RatingController.prototype._getValueFromEvent = function (e) {
        const star = e.target.closest('.lb-rating-star');
        if (!star) return null;

        let value = parseInt(star.dataset.value, 10);

        // Calculate half star if enabled
        if (this.allowHalf) {
            const rect = star.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width / 2) {
                value -= 0.5;
            }
        }

        return value;
    };

    RatingController.prototype._onMouseMove = function (e) {
        const value = this._getValueFromEvent(e);
        if (value !== null && value !== this.hoverValue) {
            this.hoverValue = value;
            this._render();
        }
    };

    RatingController.prototype._onMouseLeave = function () {
        this.hoverValue = null;
        this._render();
    };

    RatingController.prototype._onClick = function (e) {
        const value = this._getValueFromEvent(e);
        if (value !== null) {
            this._setValue(value);
        }
    };

    RatingController.prototype._onKeyDown = function (e) {
        let newValue = this.value;
        const step = this.allowHalf ? 0.5 : 1;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                e.preventDefault();
                newValue = Math.min(this.max, this.value + step);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                e.preventDefault();
                newValue = Math.max(0, this.value - step);
                break;
            case 'Home':
                e.preventDefault();
                newValue = 0;
                break;
            case 'End':
                e.preventDefault();
                newValue = this.max;
                break;
            default:
                return;
        }

        if (newValue !== this.value) {
            this._setValue(newValue);
        }
    };

    RatingController.prototype._setValue = async function (value) {
        const oldValue = this.value;
        this.value = value;
        this.hoverValue = null;
        this._render();

        // Update ARIA
        this.container.setAttribute('aria-valuenow', value.toString());

        // Update data attribute
        this.container.dataset.lbValue = value.toString();

        // Emit change event
        const changeEvent = new CustomEvent('lb:rating:change', {
            detail: { element: this.container, value, oldValue },
            bubbles: true,
            cancelable: true
        });
        this.container.dispatchEvent(changeEvent);

        if (changeEvent.defaultPrevented) {
            // Revert if prevented
            this.value = oldValue;
            this._render();
            return;
        }

        // POST to server if URL provided
        if (this.url) {
            await this._postRating(value, oldValue);
        }
    };

    RatingController.prototype._postRating = async function (value, oldValue) {
        this.container.classList.add('lb-rating-loading');

        try {
            const body = {};
            body[this.paramName] = value;

            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': this.LiveBlade.getCsrf()
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Success
            this.container.classList.remove('lb-rating-loading');
            this.container.classList.add('lb-rating-success');

            this.container.dispatchEvent(new CustomEvent('lb:rating:success', {
                detail: { element: this.container, value, data },
                bubbles: true
            }));

            setTimeout(() => {
                this.container.classList.remove('lb-rating-success');
            }, 1000);

        } catch (err) {
            console.error('Rating error:', err);

            // Revert value
            this.value = oldValue;
            this._render();

            this.container.classList.remove('lb-rating-loading');
            this.container.classList.add('lb-rating-error');

            this.container.dispatchEvent(new CustomEvent('lb:rating:error', {
                detail: { element: this.container, error: err },
                bubbles: true
            }));

            setTimeout(() => {
                this.container.classList.remove('lb-rating-error');
            }, 2000);
        }
    };

    /**
     * Public method to get value
     */
    RatingController.prototype.getValue = function () {
        return this.value;
    };

    /**
     * Public method to set value programmatically
     */
    RatingController.prototype.setValue = function (value) {
        this._setValue(value);
    };

    /**
     * Rating Binder
     */
    const RatingBinder = {
        selector: '[data-lb-rating]',

        bind(el, LiveBlade) {
            if (el._lbRating) return;
            el._lbRating = new RatingController(el, LiveBlade);
        }
    };

    /**
     * Feature registration
     */
    const RatingFeature = {
        init(LiveBlade) {
            LiveBlade.RatingController = RatingController;
        }
    };

    // Register
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('rating', RatingFeature);
        window.LiveBlade.registerBinder('rating', RatingBinder);
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RatingController, RatingFeature, RatingBinder };
    }

})(window, document);

// ============================================================
// word-counter.js
// ============================================================
/**
 * LiveBlade Feature: Character/Word Counter
 * Live counter for input fields and textareas
 *
 * Usage:
 *   <!-- Character counter -->
 *   <textarea data-lb-counter data-lb-max="500" data-lb-target="#char-count"></textarea>
 *   <span id="char-count">0/500</span>
 *
 *   <!-- Word counter -->
 *   <textarea data-lb-counter="words" data-lb-max="100" data-lb-target="#word-count"></textarea>
 *   <span id="word-count">0/100 words</span>
 *
 *   <!-- Character counter with warning threshold -->
 *   <textarea data-lb-counter 
 *             data-lb-max="280" 
 *             data-lb-warn="250"
 *             data-lb-target="#tweet-count">
 *   </textarea>
 *   <span id="tweet-count">0/280</span>
 *
 *   <!-- No max limit (just counting) -->
 *   <textarea data-lb-counter data-lb-target="#count"></textarea>
 *   <span id="count">0 characters</span>
 *
 * Options (data attributes):
 *   data-lb-counter   - Type: "chars" (default) or "words"
 *   data-lb-max       - Maximum count (optional, enables limit)
 *   data-lb-min       - Minimum count (optional)
 *   data-lb-warn      - Warning threshold (optional)
 *   data-lb-target    - Selector for counter display (required)
 *   data-lb-format    - Format: "fraction" (0/100), "remaining" (100 left), "count" (0)
 *   data-lb-block     - Block input when max reached (default: false)
 *
 * Events:
 *   lb:counter:update  - When count changes
 *   lb:counter:max     - When max is reached
 *   lb:counter:warn    - When warning threshold is reached
 *   lb:counter:valid   - When count is within limits
 *   lb:counter:invalid - When count exceeds limits
 */

;(function (window, document) {
    "use strict";

    /**
     * Counter Controller
     */
    function CounterController(el, LiveBlade) {
        this.input = el;
        this.LiveBlade = LiveBlade;
        
        // Options
        this.type = el.dataset.lbCounter || 'chars';
        if (this.type === '' || this.type === 'true') this.type = 'chars';
        
        this.max = el.dataset.lbMax ? parseInt(el.dataset.lbMax, 10) : null;
        this.min = el.dataset.lbMin ? parseInt(el.dataset.lbMin, 10) : null;
        this.warn = el.dataset.lbWarn ? parseInt(el.dataset.lbWarn, 10) : null;
        this.targetSelector = el.dataset.lbTarget;
        this.format = el.dataset.lbFormat || 'fraction';
        this.blockInput = el.hasAttribute('data-lb-block');
        
        this.target = document.querySelector(this.targetSelector);
        this.lastCount = 0;

        this._init();
    }

    CounterController.prototype._init = function () {
        if (!this.target) {
            console.warn('LiveBlade Counter: Target not found:', this.targetSelector);
            return;
        }

        // Add class to input
        this.input.classList.add('lb-counter-input');

        // Initial count
        this._update();

        // Listen for input
        this.input.addEventListener('input', this._onInput.bind(this));
        this.input.addEventListener('paste', () => setTimeout(() => this._onInput(), 0));

        // Block input if enabled and has max
        if (this.blockInput && this.max && this.type === 'chars') {
            this.input.addEventListener('keypress', this._onKeyPress.bind(this));
        }
    };

    CounterController.prototype._getCount = function () {
        const value = this.input.value;

        if (this.type === 'words') {
            // Count words (split by whitespace, filter empty)
            const words = value.trim().split(/\s+/).filter(w => w.length > 0);
            return value.trim() === '' ? 0 : words.length;
        } else {
            // Count characters
            return value.length;
        }
    };

    CounterController.prototype._onInput = function () {
        this._update();
    };

    CounterController.prototype._onKeyPress = function (e) {
        // Block new characters if at max (for character counter only)
        if (this.max && this._getCount() >= this.max) {
            // Allow control keys
            if (e.ctrlKey || e.metaKey || e.key === 'Backspace' || e.key === 'Delete') {
                return;
            }
            e.preventDefault();
        }
    };

    CounterController.prototype._update = function () {
        const count = this._getCount();
        const wasOverLimit = this.lastCount > this.max;
        const isOverLimit = this.max && count > this.max;
        const isUnderMin = this.min && count < this.min;
        const isAtWarn = this.warn && count >= this.warn;
        const isAtMax = this.max && count >= this.max;

        // Update display
        this._updateDisplay(count);

        // Update classes
        this._updateClasses(count, isOverLimit, isUnderMin, isAtWarn, isAtMax);

        // Emit events
        if (count !== this.lastCount) {
            this._emit('lb:counter:update', { count, max: this.max, type: this.type });

            if (isAtMax && !wasOverLimit) {
                this._emit('lb:counter:max', { count });
            }

            if (isAtWarn && this.lastCount < this.warn) {
                this._emit('lb:counter:warn', { count, warn: this.warn });
            }

            if (isOverLimit || isUnderMin) {
                this._emit('lb:counter:invalid', { count, max: this.max, min: this.min });
            } else if ((wasOverLimit || (this.min && this.lastCount < this.min)) && !isOverLimit && !isUnderMin) {
                this._emit('lb:counter:valid', { count });
            }
        }

        this.lastCount = count;
    };

    CounterController.prototype._updateDisplay = function (count) {
        let text;
        const typeLabel = this.type === 'words' ? 'words' : 'characters';

        switch (this.format) {
            case 'remaining':
                if (this.max) {
                    const remaining = this.max - count;
                    text = remaining >= 0 
                        ? `${remaining} ${typeLabel} remaining`
                        : `${Math.abs(remaining)} ${typeLabel} over limit`;
                } else {
                    text = `${count} ${typeLabel}`;
                }
                break;

            case 'count':
                text = count.toString();
                break;

            case 'fraction':
            default:
                if (this.max) {
                    text = `${count}/${this.max}`;
                } else {
                    text = `${count} ${typeLabel}`;
                }
                break;
        }

        this.target.textContent = text;
    };

    CounterController.prototype._updateClasses = function (count, isOverLimit, isUnderMin, isAtWarn, isAtMax) {
        // Input classes
        this.input.classList.toggle('lb-counter-warn', isAtWarn && !isOverLimit);
        this.input.classList.toggle('lb-counter-error', isOverLimit || isUnderMin);
        this.input.classList.toggle('lb-counter-max', isAtMax && !isOverLimit);

        // Target classes
        this.target.classList.toggle('lb-counter-warn', isAtWarn && !isOverLimit);
        this.target.classList.toggle('lb-counter-error', isOverLimit || isUnderMin);
        this.target.classList.toggle('lb-counter-max', isAtMax && !isOverLimit);
    };

    CounterController.prototype._emit = function (eventName, detail) {
        this.input.dispatchEvent(new CustomEvent(eventName, {
            detail: { element: this.input, target: this.target, ...detail },
            bubbles: true
        }));
    };

    /**
     * Public method to get count
     */
    CounterController.prototype.getCount = function () {
        return this._getCount();
    };

    /**
     * Public method to check if valid
     */
    CounterController.prototype.isValid = function () {
        const count = this._getCount();
        if (this.max && count > this.max) return false;
        if (this.min && count < this.min) return false;
        return true;
    };

    /**
     * Counter Binder
     */
    const CounterBinder = {
        selector: '[data-lb-counter]',

        bind(el, LiveBlade) {
            if (el._lbCounter) return;
            el._lbCounter = new CounterController(el, LiveBlade);
        }
    };

    /**
     * Feature registration
     */
    const CounterFeature = {
        init(LiveBlade) {
            LiveBlade.CounterController = CounterController;
        }
    };

    // Register
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('counter', CounterFeature);
        window.LiveBlade.registerBinder('counter', CounterBinder);
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CounterController, CounterFeature, CounterBinder };
    }

})(window, document);

// ============================================================
// forms.js
// ============================================================
/**
 * LiveBlade Feature: Forms
 * AJAX form submission with server-driven responses
 *
 * Usage:
 *   <!-- Basic form -->
 *   <form data-lb-form action="/orders" method="POST">
 *       @csrf
 *       <input name="name">
 *       <button type="submit">Create</button>
 *   </form>
 *
 *   <!-- With fallback attributes (server can override) -->
 *   <form data-lb-form 
 *         data-lb-prepend="#orders-list"
 *         data-lb-close="#add-modal"
 *         data-lb-success="Order created!"
 *         action="/orders">
 *       @csrf
 *       ...
 *   </form>
 *
 * Server Response Format:
 *   {
 *       "success": true,
 *       "message": "Order created!",
 *       "html": "<tr>...</tr>",
 *       "action": {
 *           "type": "prepend",           // prepend, append, replace, remove, refresh, redirect, replace-multiple, remove-multiple
 *           "target": "#orders-list",    // CSS selector
 *           "redirect": "/orders",       // URL for redirect
 *           "close": "#modal",           // Modal to close
 *           "fade": 3000,                // Fade out after ms
 *           "items": [...],              // For replace-multiple
 *           "targets": [...]             // For remove-multiple
 *       }
 *   }
 *
 * HTML Attributes (fallbacks if server doesn't specify):
 *   data-lb-form         - Marks as AJAX form (required)
 *   data-lb-prepend      - Insert HTML at start of target
 *   data-lb-append       - Insert HTML at end of target
 *   data-lb-replace      - Replace target element
 *   data-lb-remove       - Remove target element
 *   data-lb-refresh      - Refresh target container(s)
 *   data-lb-redirect     - Redirect to URL
 *   data-lb-close        - Close modal selector
 *   data-lb-success      - Success message (shows toast)
 *   data-lb-error        - Error message (shows toast)
 *   data-lb-fade         - Fade out target after ms
 *   data-lb-reset        - Reset form after success (default: true)
 *
 * Events:
 *   lb:form:submit    - Before form submits
 *   lb:form:success   - After successful submission
 *   lb:form:error     - On error
 */

;(function (window, document) {
    "use strict";

    /**
     * Process server response action
     */
    function processAction(action, html, form, LiveBlade) {
        if (!action || !action.type) return;

        const type = action.type;
        const target = action.target;
        const fade = action.fade;

        switch (type) {
            case 'prepend':
                if (target && html) {
                    prependHtml(target, html, fade);
                }
                break;

            case 'append':
                if (target && html) {
                    appendHtml(target, html, fade);
                }
                break;

            case 'replace':
                if (target && html) {
                    replaceHtml(target, html, fade);
                }
                break;

            case 'remove':
                if (target) {
                    removeElement(target);
                }
                break;

            case 'refresh':
                if (target) {
                    refreshTargets(target, LiveBlade);
                }
                break;

            case 'redirect':
                if (action.redirect) {
                    window.location.href = action.redirect;
                }
                break;

            case 'replace-multiple':
                if (action.items && Array.isArray(action.items)) {
                    action.items.forEach(item => {
                        if (item.target && item.html) {
                            replaceHtml(item.target, item.html, item.fade || fade);
                        }
                    });
                }
                break;

            case 'remove-multiple':
                if (action.targets && Array.isArray(action.targets)) {
                    action.targets.forEach(t => removeElement(t));
                }
                break;
        }

        // Close modal if specified
        if (action.close) {
            closeModal(action.close);
        }
    }

    /**
     * Prepend HTML to target
     */
    function prependHtml(selector, html, fade) {
        const target = document.querySelector(selector);
        if (!target) {
            console.warn('LiveBlade Forms: Prepend target not found:', selector);
            return;
        }

        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        const newElement = temp.firstElementChild;

        if (newElement) {
            // Add animation class
            newElement.classList.add('lb-row-new');
            target.insertBefore(newElement, target.firstChild);

            // Remove animation class after animation completes
            setTimeout(() => {
                newElement.classList.remove('lb-row-new');
            }, 1000);

            // Optional fade out
            if (fade) {
                setTimeout(() => {
                    fadeOutAndRemove(newElement);
                }, fade);
            }

            // Re-bind LiveBlade on new content
            if (window.LiveBlade && window.LiveBlade.bind) {
                window.LiveBlade.bind(newElement);
            }
        }
    }

    /**
     * Append HTML to target
     */
    function appendHtml(selector, html, fade) {
        const target = document.querySelector(selector);
        if (!target) {
            console.warn('LiveBlade Forms: Append target not found:', selector);
            return;
        }

        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        const newElement = temp.firstElementChild;

        if (newElement) {
            // Add animation class
            newElement.classList.add('lb-row-new');
            target.appendChild(newElement);

            // Remove animation class after animation completes
            setTimeout(() => {
                newElement.classList.remove('lb-row-new');
            }, 1000);

            // Optional fade out
            if (fade) {
                setTimeout(() => {
                    fadeOutAndRemove(newElement);
                }, fade);
            }

            // Re-bind LiveBlade on new content
            if (window.LiveBlade && window.LiveBlade.bind) {
                window.LiveBlade.bind(newElement);
            }
        }
    }

    /**
     * Replace element with new HTML
     */
    function replaceHtml(selector, html, fade) {
        const target = document.querySelector(selector);
        if (!target) {
            console.warn('LiveBlade Forms: Replace target not found:', selector);
            return;
        }

        const temp = document.createElement('div');
        temp.innerHTML = html.trim();
        const newElement = temp.firstElementChild;

        if (newElement) {
            // Add animation class
            newElement.classList.add('lb-row-updated');
            target.replaceWith(newElement);

            // Remove animation class after animation completes
            setTimeout(() => {
                newElement.classList.remove('lb-row-updated');
            }, 1000);

            // Optional fade out
            if (fade) {
                setTimeout(() => {
                    fadeOutAndRemove(newElement);
                }, fade);
            }

            // Re-bind LiveBlade on new content
            if (window.LiveBlade && window.LiveBlade.bind) {
                window.LiveBlade.bind(newElement);
            }
        }
    }

    /**
     * Remove element with animation
     */
    function removeElement(selector) {
        const target = document.querySelector(selector);
        if (!target) {
            console.warn('LiveBlade Forms: Remove target not found:', selector);
            return;
        }

        fadeOutAndRemove(target);
    }

    /**
     * Fade out and remove element
     */
    function fadeOutAndRemove(element) {
        element.classList.add('lb-row-removing');
        
        element.addEventListener('animationend', () => {
            element.remove();
        }, { once: true });

        // Fallback removal if animation doesn't fire
        setTimeout(() => {
            if (element.parentNode) {
                element.remove();
            }
        }, 500);
    }

    /**
     * Refresh target containers
     */
    function refreshTargets(selectors, LiveBlade) {
        const targets = selectors.split(',').map(s => s.trim());
        
        targets.forEach(selector => {
            const target = document.querySelector(selector);
            if (target && LiveBlade.refresh) {
                LiveBlade.refresh(selector);
            }
        });
    }

    /**
     * Close modal
     */
    function closeModal(selector) {
        const modal = document.querySelector(selector);
        if (!modal) return;
    
        // 1. Bootstrap 5 (vanilla) — most common in 2025
        if (window.bootstrap?.Modal?.getInstance) {
            const instance = window.bootstrap.Modal.getInstance(modal);
            if (instance) {
                instance.hide();
            } else {
                // Fallback: create temporary instance
                new window.bootstrap.Modal(modal).hide();
            }
            return;
        }
    
        // 2. Bootstrap 4 (jQuery)
        if (window.jQuery?.fn?.modal) {
            window.jQuery(modal).modal('hide');
            return;
        }
    
        // 3. DaisyUI, Flowbite, Tailwind UI, custom modals
        // All of them use class-based show/hide
        modal.classList.remove('show', 'open', 'visible');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('aria-modal');
    
        // Remove backdrop (all frameworks use similar classes)
        document.querySelectorAll('.modal-backdrop, .bg-black/50, .fixed.inset-0.bg-black').forEach(el => el.remove());
    
        // Unlock body scroll
        document.body.classList.remove('modal-open', 'overflow-hidden');
    
        // Optional: dispatch event for custom handling
        modal.dispatchEvent(new Event('lb:modal:closed'));

        // Generic: remove show class and hide
        modal.classList.remove('show', 'open', 'visible');
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('aria-modal');
        document.body.classList.remove('modal-open', 'overflow-hidden');

        // Remove backdrop
        const backdrop = document.querySelector('.modal-backdrop');
        if (backdrop) {
            backdrop.remove();
        }
     }    

    // function closeModal(selector) {
    //     const modal = document.querySelector(selector);
    //     if (!modal) return;

    //     // Bootstrap 5
    //     if (window.bootstrap && window.bootstrap.Modal) {
    //         const bsModal = window.bootstrap.Modal.getInstance(modal);
    //         if (bsModal) {
    //             bsModal.hide();
    //             return;
    //         }
    //     }

    //     // Bootstrap 4
    //     if (window.jQuery && window.jQuery.fn.modal) {
    //         window.jQuery(modal).modal('hide');
    //         return;
    //     }

    //     // Generic: remove show class and hide
    //     modal.classList.remove('show');
    //     modal.style.display = 'none';
    //     document.body.classList.remove('modal-open');
        
    //     // Remove backdrop
    //     const backdrop = document.querySelector('.modal-backdrop');
    //     if (backdrop) {
    //         backdrop.remove();
    //     }
    // }

    /**
     * Show toast message
     */
    function showToast(message, type = 'success', LiveBlade) {
        // Use LiveBlade toast if available
        if (LiveBlade.toast) {
            LiveBlade.toast(message, type);
            return;
        }

        // Fallback: create simple toast
        const toast = document.createElement('div');
        toast.className = `lb-toast lb-toast-${type}`;
        toast.textContent = message;
        
        // Find or create toast container
        let container = document.querySelector('.lb-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'lb-toast-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('lb-toast-show'), 10);

        // Remove after delay
        setTimeout(() => {
            toast.classList.remove('lb-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Show validation errors
     */
    function showErrors(form, errors) {
        // Clear previous errors
        clearErrors(form);

        if (!errors || typeof errors !== 'object') return;

        Object.keys(errors).forEach(field => {
            const input = form.querySelector(`[name="${field}"]`);
            const messages = Array.isArray(errors[field]) ? errors[field] : [errors[field]];

            if (input) {
                // Add error class to input
                input.classList.add('lb-input-error');

                // Create error message element
                const errorDiv = document.createElement('div');
                errorDiv.className = 'lb-field-error';
                errorDiv.textContent = messages[0];

                // Insert after input
                input.parentNode.insertBefore(errorDiv, input.nextSibling);
            }
        });

        // Also populate data-lb-errors container if exists
        const errorsContainer = form.querySelector('[data-lb-errors]');
        if (errorsContainer) {
            const allMessages = Object.values(errors).flat();
            errorsContainer.innerHTML = allMessages
                .map(msg => `<div class="lb-error-message">${msg}</div>`)
                .join('');
        }
    }

    /**
     * Clear validation errors
     */
    function clearErrors(form) {
        // Remove error classes
        form.querySelectorAll('.lb-input-error').forEach(el => {
            el.classList.remove('lb-input-error');
        });

        // Remove error messages
        form.querySelectorAll('.lb-field-error').forEach(el => el.remove());

        // Clear errors container
        const errorsContainer = form.querySelector('[data-lb-errors]');
        if (errorsContainer) {
            errorsContainer.innerHTML = '';
        }
    }

    /**
     * Get fallback action from HTML attributes
     */
    function getFallbackAction(form) {
        const action = {};

        if (form.dataset.lbPrepend) {
            action.type = 'prepend';
            action.target = form.dataset.lbPrepend;
        } else if (form.dataset.lbAppend) {
            action.type = 'append';
            action.target = form.dataset.lbAppend;
        } else if (form.dataset.lbReplace) {
            action.type = 'replace';
            action.target = form.dataset.lbReplace;
        } else if (form.dataset.lbRemove) {
            action.type = 'remove';
            action.target = form.dataset.lbRemove;
        } else if (form.dataset.lbRefresh) {
            action.type = 'refresh';
            action.target = form.dataset.lbRefresh;
        } else if (form.dataset.lbRedirect) {
            action.type = 'redirect';
            action.redirect = form.dataset.lbRedirect;
        }

        if (form.dataset.lbClose) {
            action.close = form.dataset.lbClose;
        }

        if (form.dataset.lbFade) {
            action.fade = parseInt(form.dataset.lbFade, 10);
        }

        return action.type ? action : null;
    }

    /**
     * Handle form submission
     */
    async function handleSubmit(e, form, LiveBlade) {
        e.preventDefault();

        // Emit submit event
        const submitEvent = new CustomEvent('lb:form:submit', {
            detail: { form },
            bubbles: true,
            cancelable: true
        });
        form.dispatchEvent(submitEvent);
        if (submitEvent.defaultPrevented) return;

        // Get form data
        const formData = new FormData(form);
        const url = form.action;
        const method = (form.method || 'POST').toUpperCase();

        // Disable submit button
        const submitBtn = form.querySelector('[type="submit"]');
        const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('lb-form-loading');
        }

        // Clear previous errors
        clearErrors(form);

        try {
            // Prepare fetch options
            const fetchOptions = {
                method: method === 'GET' ? 'GET' : 'POST',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': LiveBlade.getCsrf()
                },
                credentials: 'same-origin'
            };

            // Handle method spoofing for PUT/PATCH/DELETE
            if (method !== 'GET' && method !== 'POST') {
                formData.append('_method', method);
            }

            // Add body for non-GET requests
            if (method !== 'GET') {
                fetchOptions.body = formData;
            }

            const response = await fetch(url, fetchOptions);
            const data = await response.json();

            if (!response.ok || data.success === false) {
                // Handle error
                const errorMessage = data.error || data.message || 'An error occurred';
                
                // Show validation errors
                if (data.errors) {
                    showErrors(form, data.errors);
                }

                // Show error toast
                const toastMessage = form.dataset.lbError || errorMessage;
                showToast(toastMessage, 'error', LiveBlade);

                // Emit error event
                form.dispatchEvent(new CustomEvent('lb:form:error', {
                    detail: { form, error: errorMessage, errors: data.errors, data },
                    bubbles: true
                }));

                return;
            }

            // Success!
            // Determine action: server response takes priority over HTML attributes
            const serverAction = data.action || {};
            const fallbackAction = getFallbackAction(form) || {};
            const action = {
                ...fallbackAction,
                ...serverAction
            };

            // Process the action
            processAction(action, data.html, form, LiveBlade);

            // Show success message
            const successMessage = data.message || form.dataset.lbSuccess;
            if (successMessage) {
                showToast(successMessage, 'success', LiveBlade);
            }

            // Reset form (unless disabled)
            if (form.dataset.lbReset !== 'false') {
                form.reset();
            }

            // Emit success event
            form.dispatchEvent(new CustomEvent('lb:form:success', {
                detail: { form, data, action },
                bubbles: true
            }));

        } catch (err) {
            console.error('LiveBlade Form error:', err);

            const errorMessage = form.dataset.lbError || 'An error occurred. Please try again.';
            showToast(errorMessage, 'error', LiveBlade);

            form.dispatchEvent(new CustomEvent('lb:form:error', {
                detail: { form, error: err },
                bubbles: true
            }));

        } finally {
            // Re-enable submit button
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.classList.remove('lb-form-loading');
                submitBtn.innerHTML = originalBtnText;
            }
        }
    }

    /**
     * Forms Binder
     */
    const FormsBinder = {
        selector: '[data-lb-form]',

        bind(el, LiveBlade) {
            if (el._lbForm) return;
            el._lbForm = true;

            el.addEventListener('submit', (e) => handleSubmit(e, el, LiveBlade));
        }
    };

    /**
     * Feature registration
     */
    const FormsFeature = {
        init(LiveBlade) {
            // Expose helper functions for programmatic use
            LiveBlade.forms = {
                prepend: prependHtml,
                append: appendHtml,
                replace: replaceHtml,
                remove: removeElement,
                refresh: (targets) => refreshTargets(targets, LiveBlade),
                closeModal: closeModal,
                showToast: (msg, type) => showToast(msg, type, LiveBlade),
                processAction: (action, html) => processAction(action, html, null, LiveBlade)
            };
        }
    };

    // Register
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('forms', FormsFeature);
        window.LiveBlade.registerBinder('forms', FormsBinder);
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { FormsFeature, FormsBinder };
    }

})(window, document);
