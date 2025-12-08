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
 *           "reset": "#form",            // Form to reset
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

        // Reset form if specified
        if (action.reset) {
            resetForm(action.reset);
        }
    }

    /**
     * Reset a form
     */
    function resetForm(selector) {
        const form = document.querySelector(selector);
        if (!form) {
            console.warn('LiveBlade Forms: Reset target not found:', selector);
            return;
        }

        // Reset the form
        if (typeof form.reset === 'function') {
            form.reset();
        }

        // Clear any validation errors
        clearErrors(form);

        // Clear any custom inputs (Select2, TomSelect, etc.)
        // Select2
        if (window.jQuery?.fn?.select2) {
            try {
                window.jQuery(form).find('select').trigger('change');
            } catch (e) {}
        }

        // TomSelect
        form.querySelectorAll('[data-ts-input]').forEach(el => {
            if (el.tomselect) {
                try {
                    el.tomselect.clear();
                } catch (e) {}
            }
        });

        // Choices.js
        form.querySelectorAll('[data-choice]').forEach(el => {
            if (el.choices) {
                try {
                    el.choices.removeActiveItems();
                } catch (e) {}
            }
        });

        // Dispatch event
        form.dispatchEvent(new CustomEvent('lb:form:reset', { bubbles: true }));
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
     * Supports: Bootstrap 5, Bootstrap 4, Tailwind, DaisyUI, Flowbite, Alpine.js, custom modals
     */
    function closeModal(selector) {
        const modal = document.querySelector(selector);
        if (!modal) return;

        // 1. Bootstrap 5 (vanilla JS) - check for getInstance method
        if (window.bootstrap?.Modal?.getInstance) {
            try {
                const instance = window.bootstrap.Modal.getInstance(modal);
                if (instance) {
                    instance.hide();
                    return;
                }
            } catch (e) {
                // Fall through
            }
        }

        // 2. Bootstrap 4 (jQuery) - check for jQuery modal plugin
        if (window.jQuery && typeof window.jQuery.fn.modal === 'function') {
            try {
                window.jQuery(modal).modal('hide');
                return;
            } catch (e) {
                // Fall through
            }
        }

        // 3. Flowbite - check for Flowbite modal API
        if (window.FlowbiteInstances?.getModal) {
            try {
                const flowbiteModal = window.FlowbiteInstances.getModal(selector);
                if (flowbiteModal) {
                    flowbiteModal.hide();
                    return;
                }
            } catch (e) {
                // Fall through
            }
        }

        // 4. DaisyUI - uses checkbox or <dialog> element
        if (modal.tagName === 'DIALOG') {
            try {
                modal.close();
                return;
            } catch (e) {
                // Fall through
            }
        }

        // DaisyUI checkbox toggle pattern
        const daisyToggle = document.querySelector(`input[type="checkbox"]#${modal.id}-toggle, input[type="checkbox"][data-modal="${modal.id}"]`);
        if (daisyToggle) {
            daisyToggle.checked = false;
            return;
        }

        // Also check for DaisyUI modal-toggle class
        const modalToggle = document.querySelector(`.modal-toggle[id="${modal.id.replace('-modal', '')}"], .modal-toggle[data-target="${selector}"]`);
        if (modalToggle && modalToggle.type === 'checkbox') {
            modalToggle.checked = false;
            return;
        }

        // 5. Alpine.js - dispatch event for Alpine to handle
        if (modal.hasAttribute('x-data') || modal.closest('[x-data]')) {
            // Try to set open/show to false via Alpine
            modal.dispatchEvent(new CustomEvent('close-modal', { bubbles: true }));
            // Also try standard Alpine approach
            const alpineEl = modal.closest('[x-data]') || modal;
            if (window.Alpine && alpineEl._x_dataStack) {
                try {
                    const data = window.Alpine.$data(alpineEl);
                    if (data.open !== undefined) data.open = false;
                    if (data.show !== undefined) data.show = false;
                    if (data.isOpen !== undefined) data.isOpen = false;
                    if (data.showModal !== undefined) data.showModal = false;
                    return;
                } catch (e) {
                    // Fall through
                }
            }
        }

        // 6. Generic / Tailwind CSS handling
        // Remove common "show" classes
        modal.classList.remove('show', 'open', 'visible', 'is-active', 'is-open', 'active');
        
        // Add common "hide" classes (Tailwind uses 'hidden')
        modal.classList.add('hidden');
        
        // Also set display none as fallback
        modal.style.display = 'none';
        
        // Update ARIA attributes
        modal.setAttribute('aria-hidden', 'true');
        modal.removeAttribute('aria-modal');

        // Remove backdrops (various frameworks use different patterns)
        const backdropSelectors = [
            '.modal-backdrop',                    // Bootstrap
            '[data-modal-backdrop]',              // Flowbite
            '.fixed.inset-0.bg-black',           // Tailwind common pattern
            '.fixed.inset-0.bg-gray-500',        // Tailwind common pattern
            '.fixed.inset-0.bg-gray-900',        // Tailwind common pattern
            '.fixed.inset-0.bg-opacity-50',      // Tailwind with opacity
            '.fixed.inset-0.bg-opacity-75',      // Tailwind with opacity
            '.bg-black\\/50',                    // Tailwind v3 arbitrary
            '.bg-gray-500\\/75',                 // Tailwind v3 arbitrary
            '[data-backdrop]',                    // Generic
            '.overlay',                           // Generic
            '.modal-overlay',                     // Generic
        ];
        
        document.querySelectorAll(backdropSelectors.join(', ')).forEach(el => {
            // Only remove if it looks like a backdrop (fixed positioning, covers screen)
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' && (style.inset === '0px' || (style.top === '0px' && style.left === '0px'))) {
                el.remove();
            }
        });

        // Also hide sibling backdrop if exists
        const siblingBackdrop = modal.previousElementSibling;
        if (siblingBackdrop && (siblingBackdrop.classList.contains('modal-backdrop') || siblingBackdrop.classList.contains('fixed'))) {
            siblingBackdrop.classList.add('hidden');
            siblingBackdrop.style.display = 'none';
        }

        // Unlock body scroll
        document.body.classList.remove('modal-open', 'overflow-hidden', 'overflow-y-hidden', 'fixed', 'inset-0');
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';

        // Restore scroll position if it was saved
        if (document.body.dataset.scrollY) {
            window.scrollTo(0, parseInt(document.body.dataset.scrollY || '0'));
            delete document.body.dataset.scrollY;
        }

        // Dispatch event for custom handling
        modal.dispatchEvent(new CustomEvent('lb:modal:closed', { bubbles: true }));
        modal.dispatchEvent(new CustomEvent('modal:closed', { bubbles: true }));
        modal.dispatchEvent(new CustomEvent('close', { bubbles: true }));
    }

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
                reset: resetForm,
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