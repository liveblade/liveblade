/*!
 * LiveBlade v1.0.0
 * @author: LiveBlade
 * @version: 1.0.0
 * @license: MIT
 * @docs: https://liveblade.dev
 * @github: https://github.com/liveblade/liveblade
 * Production-ready AJAX for Laravel Blade
 * LiveBlade is a lightweight, server-driven reactivity framework for Laravel Blade that enables AJAX-powered interactions without the need for complex JavaScript frameworks like React or Vue. 
 * It allows you to easily add dynamic features like live search, real-time tables, and AJAX pagination to your Laravel app, with zero dependencies and minimal setup
 * 
 * @usage:
 *   
 * <script src="https://cdn.jsdelivr.net/gh/liveblade/liveblade@1/dist/liveblade.min.js"></script>
 * <link  href="https://cdn.jsdelivr.net/gh/liveblade/liveblade@1/dist/liveblade.min.css" rel="stylesheet">
 *
 * @license MIT
 * @docs https://liveblade.dev
 */

;(function (window, document) {
    "use strict";

    if (window.LiveBlade) return;

    const VERSION = "1.0.0";
    const DEBUG = localStorage.getItem("lb_debug") === "1";

    function log(...args) {
        if (DEBUG) console.log("[LiveBlade]", ...args);
    }

    // Slightly faster + cleaner (modern browsers):
    const escapeHtml = (str) => String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    function sameOrigin(url) {
        try {
            const u = new URL(url, window.location.href);
            return u.origin === window.location.origin;
        } catch {
            return false;
        }
    }

    function createAbortSignal(timeoutMs) {
        if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
            return AbortSignal.timeout(timeoutMs);
        }
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(), timeoutMs);
        return ctrl.signal;
    }

    /**
     * ============================================================
     * RATE LIMITING
     * ============================================================
     */
    const RateLimiter = {
        requests: new Map(),
        maxRequests: 100,
        windowMs: 60000,

        canRequest(key) {
            const now = Date.now();
            const list = this.requests.get(key) || [];
            const recent = list.filter(ts => now - ts < this.windowMs);

            if (recent.length >= this.maxRequests) {
                log("Rate limit exceeded:", key);
                return false;
            }

            recent.push(now);
            if (recent.length) {
                this.requests.set(key, recent);
            } else {
                this.requests.delete(key);
            }
            return true;
        },

        reset(key) {
            this.requests.delete(key);
        }
    };

    /**
     * ============================================================
     * CORE
     * ============================================================
     */
    const LiveBlade = {
        version: VERSION,
        controllers: new WeakMap(),
        instances: new Set(),
        config: {
            debounce: 300,
            retryDelay: 2000,
            maxRetries: 3,
            requestTimeout: 30000,
            skeletonHTML: null,
            errorHTML: null,
            successDuration: 1000,
            errorDuration: 2000,
            updateUrl: false, // disable update url by default
            updateUrlMode: "push", // push or replace
            preserveScroll: true, // preserve scroll position
            preserveInputs: true, // preserve input values
            smartUpdate: true, // smart update
        },
        csrf: document.querySelector('meta[name="csrf-token"]')?.content || "",
        _events: Object.create(null)
    };

    // Simple event emitter
    LiveBlade.on = function (event, handler) {
        (this._events[event] ||= []).push(handler);
        return this;
    };
    LiveBlade.off = function (event, handler) {
        if (!this._events[event]) return this;
        this._events[event] = this._events[event].filter(h => h !== handler);
        return this;
    };
    LiveBlade.emit = function (event, payload) {
        (this._events[event] || []).forEach(h => {
            try { h(payload); } catch (e) { console.error("[LiveBlade] listener error", e); }
        });
        return this;
    };
    LiveBlade.use = function (plugin) {
        if (typeof plugin === "function") plugin(this);
        return this;
    };

    /**
     * ============================================================
     * STATE HELPERS
     * ============================================================
     */
    function saveScrollPosition(el) {
        return { top: el.scrollTop, left: el.scrollLeft };
    }

    function restoreScrollPosition(el, pos) {
        if (!pos) return;
        el.scrollTop = pos.top;
        el.scrollLeft = pos.left;
    }

    function saveInputStates(root) {
        const inputs = root.querySelectorAll("input, textarea, select");
        const states = [];

        inputs.forEach(input => {
            const id = input.id;
            const name = input.name;
            let selector = null;

            if (id) {
                selector = "#" + id;
            } else if (name) {
                selector = `input[name="${CSS && CSS.escape ? CSS.escape(name) : name}"],` +
                           `select[name="${CSS && CSS.escape ? CSS.escape(name) : name}"],` +
                           `textarea[name="${CSS && CSS.escape ? CSS.escape(name) : name}"]`;
            }

            if (!selector) return;

            const state = { selector };

            if (input.type === "checkbox" || input.type === "radio") {
                state.checked = input.checked;
            } else if (input.tagName === "SELECT") {
                state.value = input.value;
                state.selectedIndex = input.selectedIndex;
            } else {
                state.value = input.value;
                state.selectionStart = input.selectionStart;
                state.selectionEnd = input.selectionEnd;
            }

            states.push(state);
        });

        return states;
    }

    function restoreInputStates(root, states) {
        if (!states) return;
        states.forEach(state => {
            const input = root.querySelector(state.selector);
            if (!input) return;
            if (document.activeElement === input) return;

            if (Object.prototype.hasOwnProperty.call(state, "checked")) {
                input.checked = state.checked;
            } else if (Object.prototype.hasOwnProperty.call(state, "value")) {
                input.value = state.value;
                if (input.tagName === "SELECT" && state.selectedIndex != null) {
                    input.selectedIndex = state.selectedIndex;
                }
                if (state.selectionStart != null && input.setSelectionRange) {
                    try {
                        input.setSelectionRange(state.selectionStart, state.selectionEnd);
                    } catch {}
                }
            }
        });
    }

    function detectContentChanges(oldHTML, newHTML) {
        if (oldHTML === newHTML) return false;
        if (!oldHTML || !newHTML) return true;
        const headOld = oldHTML.slice(0, 200);
        const headNew = newHTML.slice(0, 200);
        return headOld !== headNew || oldHTML.length !== newHTML.length;
    }

    function parseUrl(url) {
        try {
            const u = new URL(url, window.location.href);
            return {
                path: u.pathname + (u.search || ""),
                params: Object.fromEntries(u.searchParams.entries())
            };
        } catch (e) {
            log("Invalid URL:", url, e);
            return { path: "/", params: {} };
        }
    }

    function buildUrl(path, params) {
        const u = new URL(path, window.location.href);
        Object.entries(params).forEach(([k, v]) => {
            if (v == null || v === "") {
                u.searchParams.delete(k);
            } else {
                u.searchParams.set(k, v);
            }
        });
        return u.pathname + (u.search || "");
    }

    /**
     * ============================================================
     * HTML CONTROLLER
     * ============================================================
     */
    function HtmlController(el) {
        this.el = el;
        this.path = "/";
        this.params = {};
        this.abort = null;
        this.timer = null;
        this._historyInit = false;
        this.requestId = 0;
        this.retryCount = 0;

        this.el.setAttribute("role", this.el.getAttribute("role") || "region");
        this.el.setAttribute("aria-live", this.el.getAttribute("aria-live") || "polite");

        LiveBlade.instances.add(this);

        const initUrl = el.getAttribute("data-lb-fetch") ||
                        el.getAttribute("data-lb-html") ||
                        el.getAttribute("data-lb");

        if (initUrl && initUrl !== "html") {
            this.setUrl(initUrl);
        }

        const interval = parseInt(el.getAttribute("data-lb-interval"), 10);
        if (interval > 0) {
            this.timer = setInterval(() => this.refresh(), interval * 1000);
        }

        if (initUrl) {
            this.load(false, { pushState: false, first: true });
        }
    }

    HtmlController.prototype.setUrl = function (url) {
        if (!url || !sameOrigin(url)) return;
        const parsed = parseUrl(url);
        this.path = parsed.path.split("?")[0] || "/";
        this.params = parsed.params;
    };

    HtmlController.prototype.updateParam = function (key, value) {
        if (value == null || value === "") delete this.params[key];
        else this.params[key] = value;
    };

    HtmlController.prototype.resetPage = function () {
        delete this.params.page;
    };

    HtmlController.prototype.build = function () {
        return buildUrl(this.path, this.params);
    };

    HtmlController.prototype.showSkeleton = function () {
        if (this.el.innerHTML.trim()) return;

        const skeleton = LiveBlade.config.skeletonHTML || (
            '<div class="lb-skeleton" role="status" aria-label="Loading">' +
            '  <div class="lb-skeleton-line"></div>' +
            '  <div class="lb-skeleton-line" style="width:90%"></div>' +
            '  <div class="lb-skeleton-line" style="width:75%"></div>' +
            '</div>'
        );

        this.el.innerHTML = skeleton;
    };

    HtmlController.prototype.loading = function (state) {
        this.el.classList.toggle("lb-loading", state);
        this.el.setAttribute("aria-busy", state ? "true" : "false");
    };

    HtmlController.prototype.load = async function (append = false, opts = {}) {
        const url = this.build();
        if (!url || !sameOrigin(url)) return;

        if (!RateLimiter.canRequest(url)) return;

        this.requestId += 1;
        const currentRequestId = this.requestId;

        if (opts.first && !append) {
            this.showSkeleton();
        }

        if (this.abort) this.abort.abort();
        this.abort = new AbortController();
        const timeoutId = setTimeout(() => this.abort.abort(), LiveBlade.config.requestTimeout);

        const prevHTML = this.el.innerHTML;
        const scrollState = LiveBlade.config.preserveScroll ? saveScrollPosition(this.el) : null;
        const inputState = LiveBlade.config.preserveInputs ? saveInputStates(this.el) : null;

        this.loading(true);
        log("Fetching:", url);

        let response, data;
        try {
            response = await fetch(url, {
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "Accept": "application/json",
                    "X-CSRF-TOKEN": LiveBlade.csrf
                },
                signal: this.abort.signal
            });
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === "AbortError") return;
            this.handleError(err, url, append);
            return;
        }

        clearTimeout(timeoutId);

        if (currentRequestId !== this.requestId) {
            log("Stale response, ignoring");
            return;
        }

        try {
            if (response.redirected) {
                window.location.href = response.url;
                throw new Error("Redirected");
            }

            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            const ct = response.headers.get("content-type") || "";
            if (!ct.includes("application/json")) {
                throw new Error("Invalid response type");
            }

            data = await response.json();
        } catch (err) {
            this.handleError(err, url, append);
            return;
        } finally {
            this.loading(false);
        }

        const html = typeof data.html === "string" ? data.html : "";
        const hasMore = !!data.has_more;
        const changed = append || !LiveBlade.config.smartUpdate || detectContentChanges(prevHTML, html);

        if (append) {
            this.el.insertAdjacentHTML("beforeend", html);
        } else if (changed) {
            this.el.innerHTML = html;
        }

        this.el.dataset.lbHasMore = hasMore ? "1" : "0";

        this.retryCount = 0;

        if (changed) {
            LiveBlade.bind(this.el);
        }

        if (!append) {
            restoreScrollPosition(this.el, scrollState);
            restoreInputStates(this.el, inputState);
        }

        if (!append && opts.pushState && window.history && LiveBlade.config.updateUrl) {
            const newUrl = this.build();
            const state = { liveblade: true };
            if (!this._historyInit ||
                opts.replaceState ||
                LiveBlade.config.updateUrlMode === "replace") {
                window.history.replaceState(state, "", newUrl);
                this._historyInit = true;
            } else {
                window.history.pushState(state, "", newUrl);
            }
        }

        const detail = { url, data, append };
        this.el.dispatchEvent(new CustomEvent("lb:loaded", { detail, bubbles: true }));
        LiveBlade.emit("loaded", { controller: this, ...detail });

        log("Loaded:", url);
    };

    HtmlController.prototype.handleError = function (err, url, append) {
        if (err.name === "AbortError" || err.message === "Redirected") return;

        console.error("[LiveBlade] Error:", err);

        if (this.retryCount < LiveBlade.config.maxRetries) {
            this.retryCount++;
            const retries = LiveBlade.config.maxRetries;
            log(`Retrying ${this.retryCount}/${retries} in ${LiveBlade.config.retryDelay}ms`);
            setTimeout(() => this.load(append, {}), LiveBlade.config.retryDelay);
            return;
        }

        const offline = typeof navigator !== "undefined" && navigator && navigator.onLine === false;
        const msg = offline
            ? "You appear to be offline. Check your connection."
            : (err.message || "Failed to load content");

        const fallback = LiveBlade.config.errorHTML || (
            '<div class="lb-error" role="alert" aria-live="assertive">' +
            '  <strong>Failed to load content</strong>' +
            '  <p>' + escapeHtml(msg) + '</p>' +
            '  <button type="button" class="lb-retry-btn" data-lb="button" data-lb-action="refresh">' +
            '    Try Again' +
            '  </button>' +
            '</div>'
        );

        this.el.innerHTML = fallback;
        LiveBlade.bind(this.el);

        const detail = { error: err, url };
        this.el.dispatchEvent(new CustomEvent("lb:error", { detail, bubbles: true }));
        LiveBlade.emit("error", { controller: this, ...detail });
    };

    HtmlController.prototype.refresh = function () {
        this.resetPage();
        return this.load(false, { pushState: true });
    };

    HtmlController.prototype.navigate = function () {
        return this.load(false, { pushState: true });
    };

    HtmlController.prototype.more = function () {
        const page = parseInt(this.params.page || "1", 10);
        this.params.page = page + 1;
        return this.load(true);
    };

    HtmlController.prototype.dispose = function () {
        if (this.abort) this.abort.abort();
        if (this.timer) clearInterval(this.timer);
        LiveBlade.instances.delete(this);
    };

    /**
     * ============================================================
     * BINDING
     * ============================================================
     */
    LiveBlade.resolve = function (el) {
        if (!el) return null;

        const selector = el.getAttribute("data-lb-target");
        if (selector) {
            const target = document.querySelector(selector);
            return target ? LiveBlade.controllers.get(target) : null;
        }

        const container = el.closest('[data-lb="html"],[data-lb-html]');
        return container ? LiveBlade.controllers.get(container) : null;
    };

    LiveBlade.bind = function (root = document) {
        // HTML containers
        root.querySelectorAll('[data-lb="html"]:not([data-lb-bound]),[data-lb-html]:not([data-lb-bound])')
            .forEach(el => {
                LiveBlade.controllers.set(el, new HtmlController(el));
                el.setAttribute("data-lb-bound", "1");
            });

        root.querySelectorAll('[data-lb]:not([data-lb-bound])' +
                              ':not([data-lb="html"]):not([data-lb="nav"])' +
                              ':not([data-lb="search"]):not([data-lb="date"])' +
                              ':not([data-lb="select"]):not([data-lb="button"])' +
                              ':not([data-lb="checkbox"]):not([data-lb="data"])' +
                              ':not([data-lb="pagination"]):not([data-lb="form"])')
            .forEach(el => {
                const url = el.getAttribute("data-lb");
                if (url && url.startsWith("/")) {
                    el.setAttribute("data-lb-html", url);
                    LiveBlade.controllers.set(el, new HtmlController(el));
                    el.setAttribute("data-lb-bound", "1");
                }
            });

        // Nav
        root.querySelectorAll('[data-lb="nav"]:not([data-lb-bound]),[data-lb-nav]:not([data-lb-bound])')
            .forEach(el => {
                const handler = e => {
                    if (e.type === "click" || e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        const ctrl = LiveBlade.resolve(el);
                        if (!ctrl) return;
                        const url = el.dataset.lbFetch || el.getAttribute("href");
                        if (!url || !sameOrigin(url)) return;
                        ctrl.setUrl(url);
                        ctrl.refresh();
                        const nav = el.closest(".nav");
                        if (nav) {
                            nav.querySelectorAll(".active").forEach(a => a.classList.remove("active"));
                        }
                        el.classList.add("active");
                    }
                };
                el.addEventListener("click", handler);
                el.addEventListener("keydown", handler);
                el.setAttribute("tabindex", el.getAttribute("tabindex") || "0");
                el.setAttribute("role", el.getAttribute("role") || "button");
                el.setAttribute("data-lb-bound", "1");
            });

        // Search
        root.querySelectorAll('[data-lb="search"]:not([data-lb-bound]),[data-lb-search]:not([data-lb-bound])')
            .forEach(el => {
                let timeout;
                const search = () => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => {
                        const ctrl = LiveBlade.resolve(el);
                        if (!ctrl) return;
                        ctrl.updateParam(el.name || "search", el.value);
                        ctrl.resetPage();
                        ctrl.refresh();
                    }, LiveBlade.config.debounce);
                };
                el.addEventListener("input", search);
                el.setAttribute("data-lb-bound", "1");
            });

        // Date/select/checkbox/radio/etc
        ["date", "time", "number", "color", "select", "checkbox", "radio"].forEach(type => {
            root.querySelectorAll(`[data-lb="${type}"]:not([data-lb-bound]),[data-lb-${type}]:not([data-lb-bound])`)
                .forEach(el => {
                    el.addEventListener("change", () => {
                        const ctrl = LiveBlade.resolve(el);
                        if (!ctrl) return;
                        const key = el.name || type;
                        const value = el.type === "checkbox" ? (el.checked ? 1 : 0) : el.value;
                        ctrl.updateParam(key, value);
                        ctrl.resetPage();
                        ctrl.refresh();
                    });
                    el.setAttribute("data-lb-bound", "1");
                });
        });

        // Sortable
        root.querySelectorAll("[data-lb-sort]:not([data-lb-bound])")
            .forEach(th => {
                th.style.cursor = "pointer";
                th.setAttribute("tabindex", "0");
                th.setAttribute("role", "button");

                const handleSort = () => {
                    const ctrl = LiveBlade.resolve(th);
                    if (!ctrl) return;
                    const field = th.dataset.lbSort;
                    const dir = (ctrl.params.sort === field && ctrl.params.dir === "asc") ? "desc" : "asc";
                    ctrl.updateParam("sort", field);
                    ctrl.updateParam("dir", dir);
                    ctrl.resetPage();

                    const container = th.closest('[data-lb="html"],[data-lb-html]');
                    if (container) {
                        container.querySelectorAll("[data-lb-sort]").forEach(header => {
                            header.removeAttribute("aria-sort");
                        });
                        th.setAttribute("aria-sort", dir === "asc" ? "ascending" : "descending");
                    }

                    ctrl.refresh();
                };

                th.addEventListener("click", handleSort);
                th.addEventListener("keydown", e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSort();
                    }
                });

                th.setAttribute("data-lb-bound", "1");
            });

        // Buttons
        root.querySelectorAll('[data-lb="button"]:not([data-lb-bound]),[data-lb-button]:not([data-lb-bound])')
            .forEach(el => {
                el.addEventListener("click", e => {
                    e.preventDefault();
                    const ctrl = LiveBlade.resolve(el);
                    if (!ctrl) return;
                    const action = el.dataset.lbAction;
                    if (action === "refresh") return ctrl.refresh();
                    if (action === "load-more") return ctrl.more();
                    const url = el.dataset.lbFetch;
                    if (url && sameOrigin(url)) {
                        ctrl.setUrl(url);
                        ctrl.refresh();
                    }
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // Toggle update
        root.querySelectorAll('[data-lb="toggle-update"]:not([data-lb-bound]),[data-lb-toggle-update]:not([data-lb-bound])')
            .forEach(el => {
                el.addEventListener("change", () => {
                    const url = el.dataset.lbFetch;
                    if (!url || !sameOrigin(url)) return;

                    const confirmMsg = el.dataset.lbConfirm;
                    if (confirmMsg && !window.confirm(confirmMsg)) {
                        el.checked = !el.checked;
                        return;
                    }

                    const checked = el.checked;
                    const payload = { [el.name || "value"]: checked ? 1 : 0 };
                    const wrapper = el.closest(".custom-control, .form-check, .custom-switch");
                    if (wrapper) wrapper.classList.add("lb-updating");
                    el.disabled = true;

                    fetch(url, {
                        method: el.dataset.lbMethod || "POST",
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.csrf,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(payload),
                        signal: createAbortSignal(LiveBlade.config.requestTimeout)
                    })
                    .then(r => {
                        if (!r.ok) throw new Error("HTTP " + r.status);
                        return r.json().catch(() => ({}));
                    })
                    .then(() => {
                        el.disabled = false;
                        if (wrapper) {
                            wrapper.classList.remove("lb-updating");
                            wrapper.classList.add("lb-success");
                            setTimeout(() => wrapper.classList.remove("lb-success"), LiveBlade.config.successDuration);
                        }
                        const ctrl = LiveBlade.resolve(el);
                        if (ctrl) ctrl.refresh();
                    })
                    .catch(err => {
                        el.checked = !checked;
                        el.disabled = false;
                        if (wrapper) {
                            wrapper.classList.remove("lb-updating");
                            wrapper.classList.add("lb-error");
                            setTimeout(() => wrapper.classList.remove("lb-error"), LiveBlade.config.errorDuration);
                        }
                        console.error("[LiveBlade] Checkbox error:", err);
                    });
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // Data / KPI
        root.querySelectorAll('[data-lb="data"]:not([data-lb-bound]),[data-lb-data]:not([data-lb-bound])')
            .forEach(el => {
                const url = el.dataset.lbFetch;
                if (!url || !sameOrigin(url)) return;

                const update = () => {
                    fetch(url, {
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.csrf
                        },
                        signal: createAbortSignal(LiveBlade.config.requestTimeout)
                    })
                    .then(r => {
                        if (!r.ok) throw new Error("HTTP " + r.status);
                        return r.json();
                    })
                    .then(data => {
                        const value = data?.value ?? data?.count ?? data?.data ??
                            Object.values(data || {}).find(v => typeof v === "number");
                        if (value !== undefined) el.textContent = value;
                    })
                    .catch(err => {
                        console.warn("[LiveBlade] Data error:", err);
                        el.textContent = "—";
                    });
                };

                update();
                const interval = parseInt(el.dataset.lbInterval, 10);
                if (interval > 0) setInterval(update, interval * 1000);

                el.setAttribute("data-lb-bound", "1");
            });

        // Pagination
        root.querySelectorAll('[data-lb="pagination"]:not([data-lb-bound]),[data-lb-pagination]:not([data-lb-bound])')
            .forEach(el => {
                el.addEventListener("click", e => {
                    let link = e.target;
                    if (link.tagName.toLowerCase() !== "a") {
                        link = link.closest("a");
                    }
                    if (!link || !link.href || link.href === "#" ||
                        link.href.includes("javascript:") ||
                        link.classList.contains("disabled")) {
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();

                    const ctrl = LiveBlade.resolve(el);
                    if (!ctrl) return;
                    if (!sameOrigin(link.href)) return;
                    log("Pagination:", link.href);
                    ctrl.setUrl(link.href);
                    ctrl.navigate();
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // Forms
        root.querySelectorAll('[data-lb="form"]:not([data-lb-bound]),[data-lb-form]:not([data-lb-bound])')
            .forEach(form => {
                form.addEventListener("submit", e => {
                    e.preventDefault();

                    const confirmMsg = form.dataset.lbConfirm;
                    if (confirmMsg && !window.confirm(confirmMsg)) return;

                    const url = form.action;
                    if (!url || !sameOrigin(url)) return;

                    const method = (form.method || "POST").toUpperCase();
                    const formData = new FormData(form);

                    const errorContainer = form.querySelector("[data-lb-errors]");
                    if (errorContainer) errorContainer.innerHTML = "";

                    const submitBtn = form.querySelector("[type='submit']");
                    const originalBtnText = submitBtn?.textContent || "";
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = "Submitting...";
                    }

                    form.classList.add("lb-loading");

                    const hasFiles = Array.from(formData.values()).some(v => v instanceof File);
                    const headers = {
                        "X-Requested-With": "XMLHttpRequest",
                        "X-CSRF-TOKEN": LiveBlade.csrf
                    };
                    let body;

                    if (hasFiles) {
                        body = formData;
                    } else {
                        headers["Content-Type"] = "application/json";
                        const obj = {};
                        formData.forEach((v, k) => { obj[k] = v; });
                        body = JSON.stringify(obj);
                    }

                    fetch(url, {
                        method,
                        headers,
                        body,
                        signal: createAbortSignal(LiveBlade.config.requestTimeout)
                    })
                    .then(r => {
                        if (!r.ok) {
                            if (r.status === 422) {
                                return r.json().then(data => {
                                    throw { validation: true, errors: data.errors || {} };
                                });
                            }
                            throw new Error("HTTP " + r.status);
                        }
                        return r.json().catch(() => ({}));
                    })
                    .then(data => {
                        form.classList.remove("lb-loading");
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = originalBtnText;
                        }

                        const successMsg = form.dataset.lbSuccess || data.message || "Success!";
                        if (successMsg) {
                            const successDiv = document.createElement("div");
                            successDiv.className = "alert alert-success lb-success-msg";
                            successDiv.textContent = successMsg;
                            successDiv.style.marginTop = "1rem";
                            form.appendChild(successDiv);
                            setTimeout(() => successDiv.remove(), 3000);
                        }

                        form.reset();

                        const closeSelector = form.dataset.lbClose;
                        if (closeSelector) {
                            const modal = document.querySelector(closeSelector);
                            if (modal) {
                                const bsModal = window.bootstrap?.Modal?.getInstance(modal);
                                if (bsModal) {
                                    bsModal.hide();
                                } else {
                                    modal.style.display = "none";
                                    modal.classList.remove("show");
                                    document.body.classList.remove("modal-open");
                                    document.querySelector(".modal-backdrop")?.remove();
                                }
                            }
                        }

                        const ctrl = LiveBlade.resolve(form);
                        if (ctrl) ctrl.refresh();

                        const detail = { data };
                        form.dispatchEvent(new CustomEvent("lb:form-success", { detail, bubbles: true }));
                        LiveBlade.emit("form-success", { form, ...detail });
                    })
                    .catch(err => {
                        form.classList.remove("lb-loading");
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = originalBtnText;
                        }

                        if (err.validation && errorContainer) {
                            const errors = err.errors || {};
                            const wrapper = document.createElement("div");
                            wrapper.className = "alert alert-danger";
                            const ul = document.createElement("ul");
                            ul.className = "mb-0";

                            Object.keys(errors).forEach(field => {
                                errors[field].forEach(msg => {
                                    const li = document.createElement("li");
                                    li.textContent = msg;
                                    ul.appendChild(li);
                                });
                            });

                            wrapper.appendChild(ul);
                            errorContainer.innerHTML = "";
                            errorContainer.appendChild(wrapper);
                        } else if (errorContainer) {
                            const div = document.createElement("div");
                            div.className = "alert alert-danger";
                            div.textContent = err.message || "An error occurred";
                            errorContainer.innerHTML = "";
                            errorContainer.appendChild(div);
                        }

                        console.error("[LiveBlade] Form error:", err);

                        const detail = { error: err };
                        form.dispatchEvent(new CustomEvent("lb:form-error", { detail, bubbles: true }));
                        LiveBlade.emit("form-error", { form, ...detail });
                    });
                });

                form.setAttribute("data-lb-bound", "1");
            });
    };

    /**
     * ============================================================
     * PUBLIC API
     * ============================================================
     */
    LiveBlade.refresh = function (selector) {
        const el = document.querySelector(selector);
        const ctrl = el ? LiveBlade.controllers.get(el) : null;
        if (ctrl) ctrl.refresh();
        return this;
    };

    LiveBlade.cleanup = function (root = document) {
        root.querySelectorAll("[data-lb-bound]").forEach(el => {
            const ctrl = LiveBlade.controllers.get(el);
            if (ctrl && typeof ctrl.dispose === "function") ctrl.dispose();
            LiveBlade.controllers.delete(el);
            el.removeAttribute("data-lb-bound");
        });
        return this;
    };

    LiveBlade.configure = function (options) {
        Object.assign(LiveBlade.config, options || {});
        return this;
    };

    LiveBlade.debug = function (enable = true) {
        localStorage.setItem("lb_debug", enable ? "1" : "0");
        console.log("[LiveBlade] Debug mode " + (enable ? "enabled" : "disabled"));
        console.log("[LiveBlade] Reload page to apply");
        return this;
    };

    LiveBlade.test = function (selector) {
        const el = document.querySelector(selector);
        if (!el) {
            console.log("❌ Element not found:", selector);
            return;
        }
        console.log("✅ Element found:", el);
        console.log("📍 data-lb:", el.getAttribute("data-lb"));
        console.log("🔗 data-lb-target:", el.getAttribute("data-lb-target"));
        console.log("📦 Bound:", el.getAttribute("data-lb-bound"));
        const ctrl = LiveBlade.resolve(el);
        console.log("🎮 Controller:", ctrl);
        if (ctrl) {
            console.log("📂 Path:", ctrl.path);
            console.log("🔧 Params:", ctrl.params);
            console.log("🌐 Current URL:", ctrl.build());
        }
        return { el, ctrl };
    };

    /**
     * ============================================================
     * HISTORY
     * ============================================================
     */
    window.addEventListener("popstate", ev => {
        if (!ev.state?.liveblade) return;
        LiveBlade.instances.forEach(ctrl => {
            ctrl.setUrl(window.location.href);
            ctrl.load(false, { pushState: false });
        });
    });

    /**
     * ============================================================
     * AUTO-INIT & EXPOSE
     * ============================================================
     */
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => LiveBlade.bind());
    } else {
        LiveBlade.bind();
    }

    window.LiveBlade = LiveBlade;

    log("Initialized v" + VERSION);
    log("Debug: LiveBlade.debug(true)");

})(window, document);
