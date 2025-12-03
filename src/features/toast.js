/**
 * LiveBlade Feature: Toast Notifications
 * Beautiful toast notifications with auto-dismiss and actions
 */

;(function (window, document) {
    "use strict";

    const ToastManager = {
        container: null,
        toasts: new Map(),
        counter: 0,

        config: {
            position: "bottom-right",
            defaultDuration: 3000,
            errorDuration: 5000
        },

        init(LiveBlade) {
            // Merge config
            if (LiveBlade.config.toastPosition) {
                this.config.position = LiveBlade.config.toastPosition;
            }

            // Expose on LiveBlade
            LiveBlade.toast = this;
            LiveBlade.toast.success = (msg, opts) => this.show(msg, "success", opts);
            LiveBlade.toast.error = (msg, opts) => this.show(msg, "error", opts);
            LiveBlade.toast.warning = (msg, opts) => this.show(msg, "warning", opts);
            LiveBlade.toast.info = (msg, opts) => this.show(msg, "info", opts);
            LiveBlade.toast.dismiss = (id) => this.dismiss(id);
            LiveBlade.toast.dismissAll = () => this.dismissAll();
        },

        _ensureContainer() {
            if (this.container) return;

            this.container = document.createElement("div");
            this.container.className = `lb-toast-container lb-toast-${this.config.position}`;
            this.container.setAttribute("aria-live", "polite");
            this.container.setAttribute("aria-atomic", "true");
            document.body.appendChild(this.container);
        },

        show(message, type = "info", options = {}) {
            this._ensureContainer();

            const escapeHtml = window.LiveBlade?.utils?.escapeHtml || ((s) => s);
            const id = ++this.counter;
            const duration = options.duration ?? (type === "error" ? this.config.errorDuration : this.config.defaultDuration);
            const action = options.action;
            const persistent = options.persistent || false;

            const toast = document.createElement("div");
            toast.className = `lb-toast lb-toast-${type}`;
            toast.setAttribute("role", "alert");
            toast.dataset.toastId = id;

            const icons = {
                success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
                error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
                warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
            };

            let actionsHtml = "";
            if (action) {
                actionsHtml = `<button type="button" class="lb-toast-action" data-action="custom">${escapeHtml(action.text)}</button>`;
            }

            toast.innerHTML = `
                <div class="lb-toast-icon">${icons[type] || icons.info}</div>
                <div class="lb-toast-content">
                    <span class="lb-toast-message">${escapeHtml(message)}</span>
                    ${actionsHtml}
                </div>
                <button type="button" class="lb-toast-close" aria-label="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
                ${!persistent && duration > 0 ? '<div class="lb-toast-progress"></div>' : ''}
            `;

            // Close button handler
            toast.querySelector(".lb-toast-close").addEventListener("click", () => this.dismiss(id));

            // Custom action handler
            if (action) {
                toast.querySelector(".lb-toast-action").addEventListener("click", () => {
                    if (typeof action.onClick === "function") action.onClick();
                    this.dismiss(id);
                });
            }

            this.container.appendChild(toast);

            // Trigger animation
            requestAnimationFrame(() => toast.classList.add("lb-toast-show"));

            const toastData = { element: toast, timerId: null };

            // Auto-dismiss timer
            if (!persistent && duration > 0) {
                const progress = toast.querySelector(".lb-toast-progress");
                if (progress) progress.style.animationDuration = `${duration}ms`;

                toastData.timerId = setTimeout(() => this.dismiss(id), duration);
            }

            this.toasts.set(id, toastData);

            // Emit event
            if (window.LiveBlade) {
                window.LiveBlade.emit("toast:show", { id, message, type });
            }

            return id;
        },

        dismiss(id) {
            const toastData = this.toasts.get(id);
            if (!toastData) return;

            const { element, timerId } = toastData;
            if (timerId) clearTimeout(timerId);

            element.classList.remove("lb-toast-show");
            element.classList.add("lb-toast-hide");

            element.addEventListener("animationend", () => {
                element.remove();
                this.toasts.delete(id);
            }, { once: true });

            // Emit event
            if (window.LiveBlade) {
                window.LiveBlade.emit("toast:dismiss", { id });
            }
        },

        dismissAll() {
            for (const id of this.toasts.keys()) {
                this.dismiss(id);
            }
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("toast", ToastManager);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = ToastManager;
    }

})(window, document);
