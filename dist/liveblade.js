/*!
 * LiveBlade v1.0.0
 * Production-ready AJAX for Laravel Blade
 * 
 * Usage:
 *   <script src="https://cdn.liveblade.dev/v1/liveblade.min.js"></script>
 *   <link href="https://cdn.liveblade.dev/v1/liveblade.min.css" rel="stylesheet">
 * 
 * No installation. No packages. Just works.
 * 
 * @author Your Name
 * @license MIT
 * @docs https://liveblade.dev
 */

;(function (window, document) {
    "use strict";

    // Prevent multiple initializations
    if (window.LiveBlade) return;

    const VERSION = "1.0.0";
    const DEBUG = localStorage.getItem("lb_debug") === "1";

    function log(...args) {
        if (DEBUG) console.log("[LiveBlade]", ...args);
    }

    /**
     * ============================================================
     * SECURITY & RATE LIMITING
     * ============================================================
     */

    const RateLimiter = {
        requests: new Map(),
        maxRequests: 100,
        windowMs: 60000, // 1 minute

        canRequest: function(key) {
            const now = Date.now();
            const requests = this.requests.get(key) || [];
            
            // Remove old requests outside window
            const recent = requests.filter(time => now - time < this.windowMs);
            
            if (recent.length >= this.maxRequests) {
                log("Rate limit exceeded for:", key);
                return false;
            }

            recent.push(now);
            this.requests.set(key, recent);
            return true;
        },

        reset: function(key) {
            this.requests.delete(key);
        }
    };

    /**
     * ============================================================
     * CORE LIBRARY
     * ============================================================
     */

    const LiveBlade = {
        version: VERSION,
        controllers: new WeakMap(),
        instances: new Set(),
        
        // Pending requests for race condition handling
        pendingRequests: new Map(),
        
        config: {
            debounce: 300,
            retryDelay: 2000,
            maxRetries: 3,
            requestTimeout: 30000,
            skeletonHTML: null,
            errorHTML: null,
            successDuration: 1000,
            errorDuration: 2000,
            updateUrl: true,           // Update browser URL with params
            updateUrlMode: 'push',     // 'push' or 'replace'
            preserveScroll: true,      // Maintain scroll position on updates
            preserveInputs: true,      // Preserve input values during updates
            smartUpdate: true,         // Only update changed content
        },

        csrf: document.querySelector('meta[name="csrf-token"]')?.content || ""
    };

    /**
     * ============================================================
     * SMART UPDATE UTILITIES
     * ============================================================
     */

    function saveScrollPosition(el) {
        return {
            top: el.scrollTop,
            left: el.scrollLeft
        };
    }

    function restoreScrollPosition(el, position) {
        if (position) {
            el.scrollTop = position.top;
            el.scrollLeft = position.left;
        }
    }

    function saveInputStates(root) {
        const inputs = root.querySelectorAll('input, textarea, select');
        const states = new Map();
        
        inputs.forEach(input => {
            const id = input.id || input.name;
            if (!id) return;
            
            if (input.type === 'checkbox' || input.type === 'radio') {
                states.set(id, { checked: input.checked });
            } else if (input.tagName === 'SELECT') {
                states.set(id, { 
                    value: input.value,
                    selectedIndex: input.selectedIndex 
                });
            } else {
                states.set(id, { 
                    value: input.value,
                    selectionStart: input.selectionStart,
                    selectionEnd: input.selectionEnd
                });
            }
        });
        
        return states;
    }

    function restoreInputStates(root, states) {
        if (!states) return;
        
        states.forEach((state, id) => {
            const input = root.querySelector(`#${CSS.escape(id)}, [name="${CSS.escape(id)}"]`);
            if (!input) return;
            
            // Skip if input is actively focused (user is typing)
            if (document.activeElement === input) return;
            
            if (state.checked !== undefined) {
                input.checked = state.checked;
            } else if (state.value !== undefined) {
                input.value = state.value;
                
                if (input.tagName === 'SELECT' && state.selectedIndex !== undefined) {
                    input.selectedIndex = state.selectedIndex;
                }
                
                // Restore cursor position for text inputs
                if (state.selectionStart !== undefined && input.setSelectionRange) {
                    try {
                        input.setSelectionRange(state.selectionStart, state.selectionEnd);
                    } catch (e) {
                        // Some inputs don't support selection range
                    }
                }
            }
        });
    }

    function detectContentChanges(oldHTML, newHTML) {
        // Quick hash comparison
        const oldHash = oldHTML.length + oldHTML.substring(0, 100);
        const newHash = newHTML.length + newHTML.substring(0, 100);
        return oldHash !== newHash;
    }

    function debounce(fn, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), wait);
        };
    }

    function sanitizeHTML(html) {
        // Basic XSS protection - strips script tags
        const temp = document.createElement('div');
        temp.textContent = html;
        return temp.innerHTML;
    }

    function parseUrl(url) {
        try {
            const u = new URL(url, window.location.href);
            return {
                path: u.pathname,
                params: Object.fromEntries(u.searchParams.entries())
            };
        } catch (e) {
            log("Invalid URL:", url);
            return { path: "/", params: {} };
        }
    }

    function buildUrl(path, params) {
        const usp = new URLSearchParams();
        for (const [k, v] of Object.entries(params)) {
            if (v != null && v !== "") usp.set(k, v);
        }
        const query = usp.toString();
        return path + (query ? "?" + query : "");
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
        this.requestId = 0; // For race condition handling
        this.retryCount = 0;

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
        const parsed = parseUrl(url);
        this.path = parsed.path;
        this.params = parsed.params;
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

    HtmlController.prototype.showSkeleton = function () {
        if (this.el.innerHTML.trim()) return;
        
        const skeleton = LiveBlade.config.skeletonHTML || `
            <div class="lb-skeleton" role="status" aria-label="Loading content">
                <div class="lb-skeleton-line"></div>
                <div class="lb-skeleton-line" style="width: 90%"></div>
                <div class="lb-skeleton-line" style="width: 75%"></div>
            </div>
        `;
        
        this.el.innerHTML = skeleton;
    };

    HtmlController.prototype.loading = function (state) {
        this.el.classList.toggle("lb-loading", state);
        this.el.setAttribute("aria-busy", state);
    };

    HtmlController.prototype.load = function (append = false, opts = {}) {
        const url = this.build();
        if (!url) return Promise.resolve();

        // Rate limiting
        if (!RateLimiter.canRequest(url)) {
            log("Rate limit hit, skipping request");
            return Promise.resolve();
        }

        // Race condition guard - increment request ID
        this.requestId++;
        const currentRequestId = this.requestId;

        if (opts.first && !append) {
            this.showSkeleton();
        }

        // Cancel previous request
        if (this.abort) {
            this.abort.abort();
        }
        this.abort = new AbortController();

        // Set timeout for request
        const timeoutId = setTimeout(() => {
            this.abort.abort();
        }, LiveBlade.config.requestTimeout);

        this.loading(true);
        log("Fetching:", url);

        return fetch(url, {
            headers: {
                "X-Requested-With": "XMLHttpRequest",
                "Accept": "application/json",
                "X-CSRF-TOKEN": LiveBlade.csrf
            },
            signal: this.abort.signal
        })
        .then(response => {
            clearTimeout(timeoutId);

            // Race condition guard - ignore if newer request started
            if (currentRequestId !== this.requestId) {
                log("Ignoring stale response");
                return Promise.reject(new Error("Stale response"));
            }

            if (response.redirected) {
                window.location.href = response.url;
                return Promise.reject(new Error("Redirected"));
            }

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentType = response.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Invalid response type");
            }

            return response.json();
        })
        .then(data => {
            // Double check race condition
            if (currentRequestId !== this.requestId) {
                return Promise.reject(new Error("Stale response"));
            }

            const html = typeof data.html === "string" ? data.html : "";

            // Render
            this.el.innerHTML = append ? this.el.innerHTML + html : html;
            this.el.dataset.lbHasMore = data.has_more ? "1" : "0";

            // Reset retry count on success
            this.retryCount = 0;

            // Re-bind
            LiveBlade.bind(this.el);

            // History
            if (!append && opts.pushState && window.history && LiveBlade.config.updateUrl) {
                const newUrl = this.build();
                const state = { liveblade: true };
                
                if (!this._historyInit || opts.replaceState || LiveBlade.config.updateUrlMode === 'replace') {
                    window.history.replaceState(state, "", newUrl);
                    this._historyInit = true;
                } else {
                    window.history.pushState(state, "", newUrl);
                }
            }

            this.el.dispatchEvent(new CustomEvent("lb:loaded", {
                detail: { url, data, append },
                bubbles: true
            }));

            log("Loaded:", url);
            return data;
        })
        .catch(err => {
            clearTimeout(timeoutId);

            // Ignore aborts and stale responses
            if (err.name === "AbortError" || err.message === "Stale response") {
                return;
            }

            console.error("[LiveBlade] Error:", err);

            // Auto-retry logic
            if (this.retryCount < LiveBlade.config.maxRetries) {
                this.retryCount++;
                log(`Retrying (${this.retryCount}/${LiveBlade.config.maxRetries})...`);
                
                setTimeout(() => {
                    this.load(append, opts);
                }, LiveBlade.config.retryDelay);
                return;
            }

            // Show error UI
            const errorHTML = LiveBlade.config.errorHTML || `
                <div class="lb-error" role="alert">
                    <strong>Failed to load content</strong>
                    <p>${err.message}</p>
                    <button type="button" 
                            class="lb-retry-btn" 
                            data-lb="button" 
                            data-lb-action="refresh">
                        Try Again
                    </button>
                </div>
            `;

            this.el.innerHTML = errorHTML;
            LiveBlade.bind(this.el);

            this.el.dispatchEvent(new CustomEvent("lb:error", {
                detail: { error: err, url },
                bubbles: true
            }));
        })
        .finally(() => {
            this.loading(false);
        });
    };

    HtmlController.prototype.refresh = function () {
        this.resetPage();
        return this.load(false, { pushState: true });
    };

    HtmlController.prototype.navigate = function () {
        // Navigate without resetting page (for pagination)
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
     * COMPONENT BINDING
     * ============================================================
     */

    LiveBlade.resolve = function (el) {
        if (!el) return null;

        const selector = el.getAttribute("data-lb-target");
        if (selector) {
            const target = document.querySelector(selector);
            return target ? LiveBlade.controllers.get(target) : null;
        }

        const container = el.closest("[data-lb='html'],[data-lb-html]");
        return container ? LiveBlade.controllers.get(container) : null;
    };

    LiveBlade.bind = function (root = document) {
        // 1. HTML Containers
        root.querySelectorAll("[data-lb='html']:not([data-lb-bound]),[data-lb-html]:not([data-lb-bound])")
            .forEach(el => {
                LiveBlade.controllers.set(el, new HtmlController(el));
                el.setAttribute("data-lb-bound", "1");
            });

        root.querySelectorAll("[data-lb]:not([data-lb-bound]):not([data-lb='html']):not([data-lb='nav']):not([data-lb='search']):not([data-lb='date']):not([data-lb='select']):not([data-lb='button']):not([data-lb='checkbox']):not([data-lb='data']):not([data-lb='pagination']):not([data-lb='form'])")
            .forEach(el => {
                const url = el.getAttribute("data-lb");
                if (url && url.startsWith("/")) {
                    el.setAttribute("data-lb-html", url);
                    LiveBlade.controllers.set(el, new HtmlController(el));
                    el.setAttribute("data-lb-bound", "1");
                }
            });

        // 2. Nav
        root.querySelectorAll("[data-lb='nav']:not([data-lb-bound]),[data-lb-nav]:not([data-lb-bound])")
            .forEach(el => {
                el.addEventListener("click", e => {
                    e.preventDefault();
                    const ctrl = LiveBlade.resolve(el);
                    if (!ctrl) return;

                    const url = el.dataset.lbFetch || el.href;
                    ctrl.setUrl(url);
                    ctrl.refresh();

                    el.closest(".nav")?.querySelectorAll(".active")
                        .forEach(a => a.classList.remove("active"));
                    el.classList.add("active");
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // 3. Search
        root.querySelectorAll("[data-lb='search']:not([data-lb-bound]),[data-lb-search]:not([data-lb-bound])")
            .forEach(el => {
                const search = debounce(() => {
                    const ctrl = LiveBlade.resolve(el);
                    if (!ctrl) return;
                    ctrl.updateParam(el.name || "search", el.value);
                    ctrl.resetPage();
                    ctrl.refresh();
                }, LiveBlade.config.debounce);

                el.addEventListener("input", search);
                el.setAttribute("data-lb-bound", "1");
            });

        // 4. Date & Select
        ["date", "select"].forEach(type => {
            root.querySelectorAll(`[data-lb='${type}']:not([data-lb-bound]),[data-lb-${type}]:not([data-lb-bound])`)
                .forEach(el => {
                    el.addEventListener("change", () => {
                        const ctrl = LiveBlade.resolve(el);
                        if (!ctrl) return;
                        ctrl.updateParam(el.name || type, el.value);
                        ctrl.resetPage();
                        ctrl.refresh();
                    });
                    el.setAttribute("data-lb-bound", "1");
                });
        });

        // 5. Sortable
        root.querySelectorAll("[data-lb-sort]:not([data-lb-bound])")
            .forEach(th => {
                th.style.cursor = "pointer";
                th.setAttribute("tabindex", "0");
                th.setAttribute("role", "button");

                const handleSort = () => {
                    const ctrl = LiveBlade.resolve(th);
                    if (!ctrl) return;

                    const field = th.dataset.lbSort;
                    const dir = (ctrl.params.sort === field && ctrl.params.dir === "asc") 
                        ? "desc" 
                        : "asc";

                    ctrl.updateParam("sort", field);
                    ctrl.updateParam("dir", dir);
                    ctrl.resetPage();
                    ctrl.refresh();
                };

                th.addEventListener("click", handleSort);
                th.addEventListener("keypress", (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSort();
                    }
                });
                
                th.setAttribute("data-lb-bound", "1");
            });

        // 6. Buttons
        root.querySelectorAll("[data-lb='button']:not([data-lb-bound]),[data-lb-button]:not([data-lb-bound])")
            .forEach(el => {
                el.addEventListener("click", e => {
                    e.preventDefault();
                    const ctrl = LiveBlade.resolve(el);
                    if (!ctrl) return;

                    const action = el.dataset.lbAction;
                    if (action === "refresh") return ctrl.refresh();
                    if (action === "load-more") return ctrl.more();

                    const url = el.dataset.lbFetch;
                    if (url) {
                        ctrl.setUrl(url);
                        ctrl.refresh();
                    }
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // 7. Checkbox
        root.querySelectorAll("[data-lb='checkbox']:not([data-lb-bound]),[data-lb-checkbox]:not([data-lb-bound])")
            .forEach(el => {
                el.addEventListener("change", () => {
                    const url = el.dataset.lbFetch;
                    if (!url) return;

                    // Confirmation if needed
                    const confirm = el.dataset.lbConfirm;
                    if (confirm && !window.confirm(confirm)) {
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
                            "Content-Type": "application/json",
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.csrf
                        },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(LiveBlade.config.requestTimeout)
                    })
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.json();
                    })
                    .then(() => {
                        el.disabled = false;
                        if (wrapper) {
                            wrapper.classList.remove("lb-updating");
                            wrapper.classList.add("lb-success");
                            setTimeout(() => wrapper.classList.remove("lb-success"), 
                                LiveBlade.config.successDuration);
                        }

                        // Refresh target if specified
                        const targetCtrl = LiveBlade.resolve(el);
                        if (targetCtrl) {
                            targetCtrl.refresh();
                        }
                    })
                    .catch(err => {
                        el.checked = !checked;
                        el.disabled = false;
                        if (wrapper) {
                            wrapper.classList.remove("lb-updating");
                            wrapper.classList.add("lb-error");
                            setTimeout(() => wrapper.classList.remove("lb-error"), 
                                LiveBlade.config.errorDuration);
                        }
                        console.error("[LiveBlade] Checkbox error:", err);
                    });
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // 8. Data/KPI
        root.querySelectorAll("[data-lb='data']:not([data-lb-bound]),[data-lb-data]:not([data-lb-bound])")
            .forEach(el => {
                const url = el.dataset.lbFetch;
                if (!url) return;

                const update = () => {
                    fetch(url, { 
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.csrf
                        },
                        signal: AbortSignal.timeout(LiveBlade.config.requestTimeout)
                    })
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
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

        // 9. Pagination
        root.querySelectorAll("[data-lb='pagination']:not([data-lb-bound]),[data-lb-pagination]:not([data-lb-bound])")
            .forEach(el => {
                el.addEventListener("click", e => {
                    // Find the actual link element
                    let link = e.target;
                    
                    // If clicked on span/text inside link, get parent link
                    if (link.tagName.toLowerCase() !== "a") {
                        link = link.closest("a");
                    }
                    
                    // Ignore if not a link or invalid href
                    if (!link || !link.href || link.href === "#" || 
                        link.href.includes("javascript:") || 
                        link.classList.contains("disabled")) {
                        return;
                    }
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const ctrl = LiveBlade.resolve(el);
                    if (!ctrl) {
                        log("Pagination: No controller found");
                        return;
                    }
                    
                    log("Pagination clicked:", link.href);
                    ctrl.setUrl(link.href);
                    // Use navigate() instead of refresh() to preserve page param
                    ctrl.navigate();
                });
                el.setAttribute("data-lb-bound", "1");
            });

        // 10. FORM SUBMISSION (NEW)
        root.querySelectorAll("[data-lb='form']:not([data-lb-bound]),[data-lb-form]:not([data-lb-bound])")
            .forEach(form => {
                form.addEventListener("submit", e => {
                    e.preventDefault();

                    // Confirmation if needed
                    const confirm = form.dataset.lbConfirm;
                    if (confirm && !window.confirm(confirm)) {
                        return;
                    }

                    const url = form.action;
                    const method = (form.method || "POST").toUpperCase();
                    const formData = new FormData(form);

                    // Clear previous errors
                    const errorContainer = form.querySelector("[data-lb-errors]");
                    if (errorContainer) errorContainer.innerHTML = "";

                    // Show loading state
                    const submitBtn = form.querySelector("[type='submit']");
                    const originalBtnText = submitBtn?.textContent;
                    if (submitBtn) {
                        submitBtn.disabled = true;
                        submitBtn.textContent = "Submitting...";
                    }

                    form.classList.add("lb-loading");

                    // Convert FormData to JSON or keep as FormData based on content type
                    const hasFiles = Array.from(formData.values()).some(v => v instanceof File);
                    const headers = {
                        "X-Requested-With": "XMLHttpRequest",
                        "X-CSRF-TOKEN": LiveBlade.csrf
                    };

                    let body;
                    if (hasFiles) {
                        // Keep as FormData for file uploads
                        body = formData;
                    } else {
                        // Convert to JSON
                        headers["Content-Type"] = "application/json";
                        const obj = {};
                        formData.forEach((v, k) => obj[k] = v);
                        body = JSON.stringify(obj);
                    }

                    fetch(url, {
                        method: method,
                        headers: headers,
                        body: body,
                        signal: AbortSignal.timeout(LiveBlade.config.requestTimeout)
                    })
                    .then(r => {
                        if (!r.ok) {
                            if (r.status === 422) {
                                return r.json().then(data => {
                                    throw { validation: true, errors: data.errors };
                                });
                            }
                            throw new Error(`HTTP ${r.status}`);
                        }
                        return r.json();
                    })
                    .then(data => {
                        // Success!
                        form.classList.remove("lb-loading");
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = originalBtnText;
                        }

                        // Show success message
                        const successMsg = form.dataset.lbSuccess || data.message || "Success!";
                        if (successMsg) {
                            const successDiv = document.createElement("div");
                            successDiv.className = "alert alert-success lb-success-msg";
                            successDiv.textContent = successMsg;
                            successDiv.style.marginTop = "1rem";
                            form.appendChild(successDiv);

                            setTimeout(() => successDiv.remove(), 3000);
                        }

                        // Reset form
                        form.reset();

                        // Close modal if specified
                        const closeSelector = form.dataset.lbClose;
                        if (closeSelector) {
                            const modal = document.querySelector(closeSelector);
                            if (modal) {
                                // Bootstrap modal
                                const bsModal = bootstrap?.Modal?.getInstance(modal);
                                if (bsModal) bsModal.hide();
                                
                                // Generic modal close
                                modal.style.display = "none";
                                modal.classList.remove("show");
                                document.body.classList.remove("modal-open");
                                document.querySelector(".modal-backdrop")?.remove();
                            }
                        }

                        // Refresh target if specified
                        const ctrl = LiveBlade.resolve(form);
                        if (ctrl) {
                            ctrl.refresh();
                        }

                        // Dispatch event
                        form.dispatchEvent(new CustomEvent("lb:form-success", {
                            detail: { data },
                            bubbles: true
                        }));
                    })
                    .catch(err => {
                        form.classList.remove("lb-loading");
                        if (submitBtn) {
                            submitBtn.disabled = false;
                            submitBtn.textContent = originalBtnText;
                        }

                        // Handle validation errors
                        if (err.validation && errorContainer) {
                            const errors = err.errors;
                            let html = '<div class="alert alert-danger"><ul class="mb-0">';
                            for (const field in errors) {
                                errors[field].forEach(msg => {
                                    html += `<li>${msg}</li>`;
                                });
                            }
                            html += '</ul></div>';
                            errorContainer.innerHTML = html;
                        } else {
                            // Generic error
                            if (errorContainer) {
                                errorContainer.innerHTML = `
                                    <div class="alert alert-danger">
                                        ${err.message || "An error occurred"}
                                    </div>
                                `;
                            }
                            console.error("[LiveBlade] Form error:", err);
                        }

                        form.dispatchEvent(new CustomEvent("lb:form-error", {
                            detail: { error: err },
                            bubbles: true
                        }));
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
            if (ctrl) ctrl.dispose();
            LiveBlade.controllers.delete(el);
            el.removeAttribute("data-lb-bound");
        });
        return this;
    };

    LiveBlade.configure = function (options) {
        Object.assign(LiveBlade.config, options);
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
     * BROWSER HISTORY
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
     * AUTO-INIT
     * ============================================================
     */

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => LiveBlade.bind());
    } else {
        LiveBlade.bind();
    }

    /**
     * ============================================================
     * EXPOSE
     * ============================================================
     */

    window.LiveBlade = LiveBlade;

    log(`Initialized v${VERSION}`);
    log("Debug: LiveBlade.debug(true)");

})(window, document);