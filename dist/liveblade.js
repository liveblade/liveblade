/*!
 * LiveBlade v1.0.0
 * Server-driven reactivity for Laravel Blade.
 * Supports: tables, filters, nav, sort, buttons, KPIs, AJAX toggle, and pagination.
 */

;(function (window, document) {
    "use strict";
    if (window.LiveBlade) return;

    const DEBUG = false;
    function log(...args) {
        if (DEBUG) console.log("[LiveBlade]", ...args);
    }

    const LiveBlade = {
        version: "1.1.0",
        controllers: new WeakMap(),
        instances: new Set(),
        debounceDelay: 300,
        csrf: document.querySelector('meta[name="csrf-token"]')?.content || ""
    };

    /* --- Helpers --- */
    function debounce(fn, wait) {
        let t;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function parseUrl(url) {
        const u = new URL(url, window.location.href);
        return { path: u.pathname, params: Object.fromEntries(u.searchParams.entries()) };
    }

    function buildUrl(path, params) {
        const usp = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v != null && v !== "") usp.set(k, v);
        }
        return path + (usp.toString() ? "?" + usp.toString() : "");
    }

    /* --- HtmlController per container --- */
    function HtmlController(el) {
        this.el = el;
        this.path = "/";
        this.params = {};
        this.abort = null;
        this.timer = null;
        this._historyInit = false;

        LiveBlade.instances.add(this);

        const initUrl = el.getAttribute("data-lb-fetch") || el.getAttribute("data-lb-html");
        if (initUrl) this.setUrl(initUrl);

        const interval = parseInt(el.getAttribute("data-lb-interval"), 10);
        if (interval > 0) {
            this.timer = setInterval(() => this.refresh(), interval * 1000);
        }

        this.load(false, { pushState: false, first: true });
    }

    HtmlController.prototype.setUrl = function (url) {
        const p = parseUrl(url);
        this.path = p.path;
        this.params = p.params;
    };

    HtmlController.prototype.updateParam = function (key, value) {
        if (!value) delete this.params[key];
        else this.params[key] = value;
    };

    HtmlController.prototype.resetPage = function () {
        delete this.params.page;
    };

    HtmlController.prototype.build = function () {
        return buildUrl(this.path, this.params);
    };

    HtmlController.prototype.showSkeletonIfEmpty = function () {
        if (this.el.innerHTML.trim()) return;
        if (this.el.dataset.lbSkeleton === "1") return;
        this.el.dataset.lbSkeleton = "1";
        this.el.innerHTML = `
            <div class="lb-skeleton">
                <div class="placeholder-glow"><span class="placeholder col-12"></span></div>
                <div class="placeholder-glow mt-1"><span class="placeholder col-10"></span></div>
                <div class="placeholder-glow mt-1"><span class="placeholder col-8"></span></div>
            </div>
        `;
    };

    HtmlController.prototype.loading = function (on) {
        this.el.classList.toggle("lb-loading", !!on);
    };

    HtmlController.prototype.load = function (append, opts = {}) {
        const url = this.build();
        if (!url) return;

        if (opts.first && !append) this.showSkeletonIfEmpty();

        if (this.abort) this.abort.abort();
        this.abort = new AbortController();
        this.loading(true);

        log("GET", url);

        fetch(url, {
            headers: { "X-Requested-With": "XMLHttpRequest" },
            signal: this.abort.signal
        })
        .then(r => r.json())
        .then(data => {
            const html = typeof data.html === "string" ? data.html : "";
            this.el.innerHTML = append
                ? this.el.innerHTML + html
                : html;

            this.el.dataset.lbHasMore = data.has_more ? "1" : "0";

            LiveBlade.bind(this.el);

            if (!append && opts.pushState && window.history?.pushState) {
                const newUrl = this.build();
                const state = { liveblade: true };
                if (!this._historyInit || opts.replaceState) {
                    window.history.replaceState(state, "", newUrl);
                    this._historyInit = true;
                } else {
                    window.history.pushState(state, "", newUrl);
                }
            }
        })
        .catch(err => {
            if (err.name === "AbortError") return;
            console.error("[LiveBlade] fetch error:", err);
            this.el.innerHTML = `
                <div class="alert alert-danger lb-error mb-0">
                    Error loading content.
                    <button type="button" class="btn btn-sm btn-outline-light ms-2" data-lb="button" data-lb-action="refresh">Retry</button>
                </div>
            `;
            LiveBlade.bind(this.el);
        })
        .finally(() => this.loading(false));
    };

    HtmlController.prototype.refresh = function () {
        this.load(false, { pushState: true });
    };

    HtmlController.prototype.more = function () {
        const p = parseInt(this.params.page || "1", 10);
        this.params.page = p + 1;
        this.load(true, { pushState: false });
    };

    HtmlController.prototype.dispose = function () {
        if (this.abort) this.abort.abort();
        if (this.timer) clearInterval(this.timer);
        LiveBlade.instances.delete(this);
    };

    /* --- Target resolution --- */
    LiveBlade.resolve = function (el) {
        if (!el) return null;
        const sel = el.getAttribute("data-lb-target");
        if (sel) return LiveBlade.controllers.get(document.querySelector(sel)) || null;
        const container = el.closest("[data-lb='html'],[data-lb-html]");
        return container ? LiveBlade.controllers.get(container) || null : null;
    };

    /* --- Binding logic --- */
    LiveBlade.bind = function (root = document) {
        // 1. HTML containers
        root.querySelectorAll("[data-lb='html']:not([data-lb-init]),[data-lb-html]:not([data-lb-init])")
            .forEach(el => {
                LiveBlade.controllers.set(el, new HtmlController(el));
                el.setAttribute("data-lb-init", "1");
            });

        // 2. Nav
        root.querySelectorAll("[data-lb='nav']:not([data-lb-init])")
            .forEach(el => {
                el.addEventListener("click", e => {
                    e.preventDefault();
                    const c = LiveBlade.resolve(el);
                    if (!c) return;
                    c.setUrl(el.dataset.lbFetch);
                    c.refresh();
                    el.closest(".nav")?.querySelectorAll(".active").forEach(a => a.classList.remove("active"));
                    el.classList.add("active");
                });
                el.setAttribute("data-lb-init", "1");
            });

        // 3. Search
        root.querySelectorAll("[data-lb='search']:not([data-lb-init])")
            .forEach(el => {
                el.addEventListener("input", debounce(() => {
                    const c = LiveBlade.resolve(el);
                    if (!c) return;
                    c.updateParam(el.name || "q", el.value);
                    c.refresh();
                }, LiveBlade.debounceDelay));
                el.setAttribute("data-lb-init", "1");
            });

        // 4. Filters
        ["date", "select"].forEach(type => {
            root.querySelectorAll(`[data-lb='${type}']:not([data-lb-init])`)
                .forEach(el => {
                    el.addEventListener("change", () => {
                        const c = LiveBlade.resolve(el);
                        if (c) {
                            c.updateParam(el.name || type, el.value);
                            c.refresh();
                        }
                    });
                    el.setAttribute("data-lb-init", "1");
                });
        });

        // 5. Sorting
        root.querySelectorAll("[data-lb-sort]:not([data-lb-init])")
            .forEach(th => {
                th.style.cursor = "pointer";
                th.addEventListener("click", () => {
                    const c = LiveBlade.resolve(th);
                    if (!c) return;
                    const field = th.dataset.lbSort;
                    const dir = (c.params.sort === field && c.params.dir === "asc") ? "desc" : "asc";
                    c.updateParam("sort", field);
                    c.updateParam("dir", dir);
                    c.refresh();
                });
                th.setAttribute("data-lb-init", "1");
            });

        // 6. Buttons
        root.querySelectorAll("[data-lb='button']:not([data-lb-init])")
            .forEach(el => {
                el.addEventListener("click", e => {
                    e.preventDefault();
                    const c = LiveBlade.resolve(el);
                    if (!c) return;
                    const act = el.dataset.lbAction;
                    if (act === "refresh") return c.refresh();
                    if (act === "load-more") return c.more();
                    if (el.dataset.lbFetch) {
                        c.setUrl(el.dataset.lbFetch);
                        c.refresh();
                    }
                });
                el.setAttribute("data-lb-init", "1");
            });

        // 7. Toggle checkbox
        root.querySelectorAll("[data-lb='checkbox']:not([data-lb-init])")
            .forEach(el => {
                el.addEventListener("change", () => {
                    const url = el.dataset.lbFetch;
                    if (!url) return;
                    const body = { [el.name || "value"]: el.checked ? 1 : 0 };
                    fetch(url, {
                        method: el.dataset.lbMethod || "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.csrf
                        },
                        body: JSON.stringify(body)
                    }).catch(err => console.error("[LiveBlade] checkbox error:", err));
                });
                el.setAttribute("data-lb-init", "1");
            });

        // 8. KPI Data
        root.querySelectorAll("[data-lb='data']:not([data-lb-init])")
            .forEach(el => {
                const run = () => {
                    fetch(el.dataset.lbFetch, {
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    })
                    .then(r => r.json())
                    .then(data => {
                        const val = data?.data ?? data?.value ?? data?.count ??
                            Object.values(data || {}).find(v => typeof v === "number");
                        if (val !== undefined) el.textContent = val;
                    })
                    .catch(err => console.warn("[LiveBlade:data]", err));
                };

                run();
                const interval = parseInt(el.dataset.lbInterval, 10);
                if (interval > 0) setInterval(run, interval * 1000);
                el.setAttribute("data-lb-init", "1");
            });

        // 9. Pagination hijack
        root.querySelectorAll("[data-lb='pagination']:not([data-lb-init])")
            .forEach(el => {
                el.addEventListener("click", e => {
                    const link = e.target.closest("a");
                    if (!link?.href || link.target === "_blank") return;
                    if (link.href.includes('#') && !link.href.includes('?')) return;
                    e.preventDefault();
                    const c = LiveBlade.resolve(el);
                    if (c) {
                        c.setUrl(link.href);
                        c.refresh();
                    }
                });
                el.setAttribute("data-lb-init", "1");
            });
    };

    LiveBlade.refresh = function (selector) {
        const el = document.querySelector(selector);
        const c = LiveBlade.resolve(el);
        if (c) c.refresh();
    };

    LiveBlade.cleanup = function (root = document) {
        root.querySelectorAll("[data-lb='html'],[data-lb-html]").forEach(el => {
            const ctrl = LiveBlade.controllers.get(el);
            if (ctrl) ctrl.dispose();
            LiveBlade.controllers.delete(el);
        });
    };

    window.addEventListener("popstate", ev => {
        if (!ev.state?.liveblade) return;
        LiveBlade.instances.forEach(ctrl => {
            ctrl.setUrl(window.location.href);
            ctrl.load(false, { pushState: false });
        });
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => LiveBlade.bind());
    } else {
        LiveBlade.bind();
    }

    window.LiveBlade = LiveBlade;
})(window, document);
