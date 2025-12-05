/**
 * LiveBlade Feature: Confirm Action
 * "Are you sure?" confirmation before actions
 *
 * Usage:
 *   <!-- Basic confirm -->
 *   <button data-lb-confirm="Delete this item?" 
 *           data-lb-fetch="/items/1/delete" 
 *           data-lb-method="DELETE">
 *       Delete
 *   </button>
 *
 *   <!-- With target refresh -->
 *   <button data-lb-confirm="Remove from list?" 
 *           data-lb-fetch="/items/1/remove" 
 *           data-lb-method="POST"
 *           data-lb-target="#items-list">
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
 *   data-lb-target        - Selector to refresh after success (optional)
 *   data-lb-confirm-yes   - Text for confirm button (default: "Yes")
 *   data-lb-confirm-no    - Text for cancel button (default: "Cancel")
 *   data-lb-confirm-title - Title for dialog (default: "Confirm")
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
     * Handle confirm action
     */
    async function handleConfirm(el, LiveBlade) {
        const message = el.dataset.lbConfirm;
        const url = el.dataset.lbFetch || el.getAttribute('href');
        const method = (el.dataset.lbMethod || 'POST').toUpperCase();
        const targetSelector = el.dataset.lbTarget;
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
            const originalText = el.textContent;
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

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const data = await response.json();

                // Success feedback
                el.classList.remove('lb-confirm-loading');
                el.classList.add('lb-confirm-success');

                // Emit success event
                el.dispatchEvent(new CustomEvent('lb:confirm:success', {
                    detail: { element: el, data },
                    bubbles: true
                }));

                // // Refresh target if specified
                // if (targetSelector) {
                //     const target = document.querySelector(targetSelector);
                //     if (target && LiveBlade.refresh) {
                //         LiveBlade.refresh(targetSelector);
                //     }
                // }

                // Handle actions on target
                if (targetSelector) {
                    const target = document.querySelector(targetSelector);
                    const action = el.dataset.lbAction || 'refresh'; // default

                    if (target) {
                        switch (action) {

                            case 'hide':
                                target.style.transition = "opacity .25s ease";
                                target.style.opacity = "0";
                                setTimeout(() => target.remove(), 250);
                                break;

                            case 'remove':
                                target.remove();
                                break;

                            case 'refresh':
                                if (LiveBlade.refresh) LiveBlade.refresh(targetSelector);
                                break;

                            case 'none':
                                // do nothing
                                break;
                        }
                    }
                }


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