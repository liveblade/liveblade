/**
 * LiveBlade Feature: Toast Notifications
 * Beautiful, customizable toast notifications
 *
 * Usage:
 *   // Simple
 *   LiveBlade.toast.success('Order created!');
 *   LiveBlade.toast.error('Something went wrong');
 *   LiveBlade.toast.warning('Are you sure?');
 *   LiveBlade.toast.info('New update available');
 *
 *   // With options
 *   LiveBlade.toast.success('Saved!', { duration: 5000 });
 *   LiveBlade.toast.error('Failed', { persistent: true });
 *
 *   // With action button
 *   LiveBlade.toast.info('File deleted', {
 *       action: {
 *           text: 'Undo',
 *           onClick: () => restoreFile()
 *       }
 *   });
 *
 *   // Direct call
 *   LiveBlade.toast.show('Custom message', 'success', { duration: 3000 });
 *
 *   // Dismiss
 *   const id = LiveBlade.toast.success('Hello');
 *   LiveBlade.toast.dismiss(id);
 *   LiveBlade.toast.dismissAll();
 *
 * Configuration (in LiveBlade.configure or data-lb-toast-* on body):
 *   LiveBlade.configure({
 *       toastPosition: 'top-right',      // top-left, top-center, top-right, bottom-left, bottom-center, bottom-right
 *       toastDuration: 3000,             // Default duration in ms
 *       toastErrorDuration: 5000,        // Duration for error toasts
 *       toastShowClose: true,            // Show X close button
 *       toastShowIcon: true,             // Show type icon
 *       toastShowProgress: true,         // Show progress bar
 *       toastPauseOnHover: true,         // Pause timer on hover
 *       toastMaxVisible: 5,              // Max toasts visible at once
 *       toastNewestOnTop: true,          // New toasts appear on top
 *   });
 *
 * Custom Colors (CSS variables):
 *   :root {
 *       --lb-toast-success-bg: #10b981;
 *       --lb-toast-success-text: #ffffff;
 *       --lb-toast-error-bg: #ef4444;
 *       --lb-toast-error-text: #ffffff;
 *       --lb-toast-warning-bg: #f59e0b;
 *       --lb-toast-warning-text: #ffffff;
 *       --lb-toast-info-bg: #3b82f6;
 *       --lb-toast-info-text: #ffffff;
 *   }
 *
 * Events:
 *   lb:toast:show    - When toast is shown
 *   lb:toast:dismiss - When toast is dismissed
 *   lb:toast:action  - When action button is clicked
 */

;(function (window, document) {
    "use strict";

    const DEFAULT_CONFIG = {
        position: 'bottom-right',
        duration: 3000,
        errorDuration: 5000,
        showClose: true,
        showIcon: true,
        showProgress: true,
        pauseOnHover: true,
        maxVisible: 5,
        newestOnTop: true,
    };

    const ICONS = {
        success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
        </svg>`,
        error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
        </svg>`,
        warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>`,
        info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>`,
        close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>`
    };

    /**
     * Toast Manager
     */
    const ToastManager = {
        container: null,
        toasts: new Map(),
        counter: 0,
        config: { ...DEFAULT_CONFIG },

        /**
         * Initialize with LiveBlade
         */
        init(LiveBlade) {
            // Merge config from LiveBlade
            if (LiveBlade.config) {
                this.configure({
                    position: LiveBlade.config.toastPosition,
                    duration: LiveBlade.config.toastDuration,
                    errorDuration: LiveBlade.config.toastErrorDuration,
                    showClose: LiveBlade.config.toastShowClose,
                    showIcon: LiveBlade.config.toastShowIcon,
                    showProgress: LiveBlade.config.toastShowProgress,
                    pauseOnHover: LiveBlade.config.toastPauseOnHover,
                    maxVisible: LiveBlade.config.toastMaxVisible,
                    newestOnTop: LiveBlade.config.toastNewestOnTop,
                });
            }

            // Also check body data attributes
            const body = document.body;
            if (body.dataset.lbToastPosition) {
                this.config.position = body.dataset.lbToastPosition;
            }

            // Expose methods on LiveBlade
            LiveBlade.toast = this.createApi();
        },

        /**
         * Configure toast options
         */
        configure(options) {
            Object.keys(options).forEach(key => {
                if (options[key] !== undefined) {
                    this.config[key] = options[key];
                }
            });

            // Update container position if it exists
            if (this.container) {
                this._updateContainerPosition();
            }
        },

        /**
         * Create public API
         */
        createApi() {
            const self = this;
            
            const api = function(message, type, options) {
                return self.show(message, type || 'info', options);
            };

            api.show = (message, type, options) => self.show(message, type, options);
            api.success = (message, options) => self.show(message, 'success', options);
            api.error = (message, options) => self.show(message, 'error', options);
            api.warning = (message, options) => self.show(message, 'warning', options);
            api.info = (message, options) => self.show(message, 'info', options);
            api.dismiss = (id) => self.dismiss(id);
            api.dismissAll = () => self.dismissAll();
            api.configure = (options) => self.configure(options);

            return api;
        },

        /**
         * Ensure container exists
         */
        _ensureContainer() {
            if (this.container) return;

            this.container = document.createElement('div');
            this.container.className = 'lb-toast-container';
            this.container.setAttribute('aria-live', 'polite');
            this.container.setAttribute('aria-atomic', 'true');
            this._updateContainerPosition();
            document.body.appendChild(this.container);
        },

        /**
         * Update container position class
         */
        _updateContainerPosition() {
            if (!this.container) return;

            // Remove old position classes
            this.container.className = 'lb-toast-container';
            
            // Add new position class
            this.container.classList.add(`lb-toast-${this.config.position}`);
        },

        /**
         * Escape HTML to prevent XSS
         */
        _escapeHtml(str) {
            if (window.LiveBlade?.utils?.escapeHtml) {
                return window.LiveBlade.utils.escapeHtml(str);
            }
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        },

        /**
         * Show a toast
         */
        show(message, type = 'info', options = {}) {
            this._ensureContainer();

            const id = ++this.counter;
            const config = this.config;
            
            // Determine duration
            let duration = options.duration ?? 
                (type === 'error' ? config.errorDuration : config.duration);
            
            // Check if persistent
            if (options.persistent) {
                duration = 0;
            }

            // Enforce max visible
            this._enforceMaxVisible();

            // Create toast element
            const toast = document.createElement('div');
            toast.className = `lb-toast lb-toast-${type}`;
            toast.setAttribute('role', 'alert');
            toast.dataset.toastId = id;

            // Build toast HTML
            let html = '';

            // Icon
            if (config.showIcon !== false && options.showIcon !== false) {
                html += `<div class="lb-toast-icon">${ICONS[type] || ICONS.info}</div>`;
            }

            // Content
            html += '<div class="lb-toast-content">';
            
            // Title (optional)
            if (options.title) {
                html += `<div class="lb-toast-title">${this._escapeHtml(options.title)}</div>`;
            }
            
            // Message
            html += `<div class="lb-toast-message">${this._escapeHtml(message)}</div>`;
            
            // Action button (optional)
            if (options.action) {
                html += `<button type="button" class="lb-toast-action">${this._escapeHtml(options.action.text)}</button>`;
            }
            
            html += '</div>';

            // Close button
            if (config.showClose !== false && options.showClose !== false) {
                html += `<button type="button" class="lb-toast-close" aria-label="Close">${ICONS.close}</button>`;
            }

            // Progress bar
            if (duration > 0 && config.showProgress !== false && options.showProgress !== false) {
                html += '<div class="lb-toast-progress"><div class="lb-toast-progress-bar"></div></div>';
            }

            toast.innerHTML = html;

            // Event handlers
            const closeBtn = toast.querySelector('.lb-toast-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.dismiss(id));
            }

            const actionBtn = toast.querySelector('.lb-toast-action');
            if (actionBtn && options.action) {
                actionBtn.addEventListener('click', () => {
                    // Emit action event
                    this._emit('lb:toast:action', { id, action: options.action });
                    
                    if (typeof options.action.onClick === 'function') {
                        options.action.onClick();
                    }
                    
                    // Dismiss unless action says not to
                    if (options.action.dismiss !== false) {
                        this.dismiss(id);
                    }
                });
            }

            // Add to container
            if (config.newestOnTop) {
                this.container.insertBefore(toast, this.container.firstChild);
            } else {
                this.container.appendChild(toast);
            }

            // Trigger show animation
            requestAnimationFrame(() => {
                toast.classList.add('lb-toast-show');
            });

            // Store toast data
            const toastData = {
                element: toast,
                timerId: null,
                duration: duration,
                remaining: duration,
                startTime: Date.now()
            };

            // Start progress animation
            const progressBar = toast.querySelector('.lb-toast-progress-bar');
            if (progressBar && duration > 0) {
                progressBar.style.animationDuration = `${duration}ms`;
                progressBar.classList.add('lb-toast-progress-active');
            }

            // Auto-dismiss timer
            if (duration > 0) {
                toastData.timerId = setTimeout(() => this.dismiss(id), duration);
            }

            // Pause on hover
            if (config.pauseOnHover && duration > 0) {
                toast.addEventListener('mouseenter', () => this._pauseTimer(id));
                toast.addEventListener('mouseleave', () => this._resumeTimer(id));
            }

            this.toasts.set(id, toastData);

            // Emit show event
            this._emit('lb:toast:show', { id, message, type, options });

            return id;
        },

        /**
         * Pause timer on hover
         */
        _pauseTimer(id) {
            const toastData = this.toasts.get(id);
            if (!toastData || !toastData.timerId) return;

            // Clear current timer
            clearTimeout(toastData.timerId);
            toastData.timerId = null;

            // Calculate remaining time
            const elapsed = Date.now() - toastData.startTime;
            toastData.remaining = Math.max(0, toastData.duration - elapsed);

            // Pause progress bar animation
            const progressBar = toastData.element.querySelector('.lb-toast-progress-bar');
            if (progressBar) {
                progressBar.style.animationPlayState = 'paused';
            }
        },

        /**
         * Resume timer after hover
         */
        _resumeTimer(id) {
            const toastData = this.toasts.get(id);
            if (!toastData || toastData.remaining <= 0) return;

            // Update start time for next pause calculation
            toastData.startTime = Date.now() - (toastData.duration - toastData.remaining);

            // Resume progress bar animation
            const progressBar = toastData.element.querySelector('.lb-toast-progress-bar');
            if (progressBar) {
                progressBar.style.animationPlayState = 'running';
            }

            // Set new timer with remaining time
            toastData.timerId = setTimeout(() => this.dismiss(id), toastData.remaining);
        },

        /**
         * Enforce max visible toasts
         */
        _enforceMaxVisible() {
            const max = this.config.maxVisible;
            if (!max || this.toasts.size < max) return;

            // Dismiss oldest toasts
            const toastIds = Array.from(this.toasts.keys());
            const toRemove = toastIds.slice(0, toastIds.length - max + 1);
            toRemove.forEach(id => this.dismiss(id));
        },

        /**
         * Dismiss a toast
         */
        dismiss(id) {
            const toastData = this.toasts.get(id);
            if (!toastData) return;

            const { element, timerId } = toastData;

            // Clear timer
            if (timerId) {
                clearTimeout(timerId);
            }

            // Animate out
            element.classList.remove('lb-toast-show');
            element.classList.add('lb-toast-hide');

            // Remove after animation
            const handleAnimationEnd = () => {
                element.remove();
                this.toasts.delete(id);
            };

            element.addEventListener('animationend', handleAnimationEnd, { once: true });

            // Fallback removal
            setTimeout(() => {
                if (this.toasts.has(id)) {
                    handleAnimationEnd();
                }
            }, 400);

            // Emit dismiss event
            this._emit('lb:toast:dismiss', { id });
        },

        /**
         * Dismiss all toasts
         */
        dismissAll() {
            for (const id of this.toasts.keys()) {
                this.dismiss(id);
            }
        },

        /**
         * Emit custom event
         */
        _emit(eventName, detail) {
            document.dispatchEvent(new CustomEvent(eventName, {
                detail,
                bubbles: true
            }));

            // Also emit on LiveBlade if available
            if (window.LiveBlade?.emit) {
                window.LiveBlade.emit(eventName.replace('lb:', ''), detail);
            }
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('toast', ToastManager);
    }

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = ToastManager;
    }

})(window, document);