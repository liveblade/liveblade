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
        // Skip if data-lb-no-history is set on element or any parent
        const noHistory = this.el.closest('[data-lb-no-history]') !== null || 
                          this.el.hasAttribute('data-lb-no-history');
        
        if (!append && opts.pushState && window.history && config.updateUrl && !noHistory) {
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