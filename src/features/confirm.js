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