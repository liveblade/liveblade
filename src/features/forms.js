/**
 * LiveBlade Feature: Forms
 * AJAX form submission with validation error handling
 */

;(function (window, document) {
    "use strict";

    /**
     * Button state helpers
     */
    function saveButtonState(btn) {
        if (!btn) return null;
        return {
            html: btn.innerHTML,
            disabled: btn.disabled,
            width: btn.offsetWidth,
            height: btn.offsetHeight
        };
    }

    function setButtonLoading(btn, state, config) {
        if (!btn || !state) return;

        if (config.buttonKeepWidth !== false) {
            btn.style.minWidth = state.width + "px";
            btn.style.minHeight = state.height + "px";
        }

        btn.disabled = true;
        btn.classList.add("lb-btn-loading");

        const icon = config.buttonLoadingIcon || '<svg class="lb-spinner" viewBox="0 0 24 24"><circle class="lb-spinner-circle" cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
        const textSpan = btn.querySelector(".lb-btn-text") || btn;
        const originalText = textSpan.textContent || "Saving";

        btn.innerHTML = `${icon}<span class="lb-btn-text">${originalText}</span>`;
    }

    function restoreButtonState(btn, state, success, config) {
        if (!btn || !state) return;

        btn.disabled = state.disabled;
        btn.innerHTML = state.html;
        btn.classList.remove("lb-btn-loading");

        if (config.buttonKeepWidth !== false) {
            btn.style.minWidth = "";
            btn.style.minHeight = "";
        }

        const cls = success ? "lb-btn-success" : "lb-btn-error";
        const dur = success ? config.successDuration : config.errorDuration;
        btn.classList.add(cls);
        setTimeout(() => btn.classList.remove(cls), dur);
    }

    /**
     * Forms feature configuration
     */
    const FormsFeature = {
        config: {
            formResetOnSuccess: true,
            formPreserveOnSubmit: true,
            buttonKeepWidth: true,
            buttonLoadingIcon: '<svg class="lb-spinner" viewBox="0 0 24 24"><circle class="lb-spinner-circle" cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3"/></svg>'
        },

        init(LiveBlade) {
            // Merge config
            Object.assign(LiveBlade.config, this.config);

            // Expose helpers
            LiveBlade.forms = {
                saveButtonState,
                setButtonLoading: (btn, state) => setButtonLoading(btn, state, LiveBlade.config),
                restoreButtonState: (btn, state, success) => restoreButtonState(btn, state, success, LiveBlade.config)
            };
        }
    };

    /**
     * Form Binder
     */
    const FormBinder = {
        selector: '[data-lb="form"], [data-lb-form]',

        bind(form, LiveBlade) {
            const { sameOrigin, cssEscape, error } = LiveBlade.utils;
            const config = LiveBlade.config;

            form.addEventListener("submit", async (e) => {
                e.preventDefault();

                // Confirmation
                if (form.dataset.lbConfirm && !window.confirm(form.dataset.lbConfirm)) return;

                const url = form.action;
                if (!url || !sameOrigin(url)) return;

                const method = (form.method || "POST").toUpperCase();
                const formData = new FormData(form);

                // Clear previous errors
                const errorContainer = form.querySelector("[data-lb-errors]");
                if (errorContainer) errorContainer.innerHTML = "";

                // Button loading state
                const submitBtn = form.querySelector('[type="submit"], button:not([type])');
                const btnState = saveButtonState(submitBtn);
                setButtonLoading(submitBtn, btnState, config);

                form.classList.add("lb-submitting");

                // Detect file uploads
                const hasFiles = Array.from(formData.values()).some((v) => v instanceof File && v.size > 0);

                const headers = {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRF-TOKEN": LiveBlade.getCsrf(),
                    "Accept": "application/json"
                };

                let body;
                if (hasFiles) {
                    body = formData;
                } else {
                    headers["Content-Type"] = "application/json";
                    const obj = {};
                    formData.forEach((v, k) => {
                        if (k.endsWith("[]")) {
                            const key = k.slice(0, -2);
                            if (!obj[key]) obj[key] = [];
                            obj[key].push(v);
                        } else {
                            obj[k] = v;
                        }
                    });
                    body = JSON.stringify(obj);
                }

                try {
                    const response = await fetch(url, { method, headers, body, credentials: "same-origin" });

                    // Validation errors
                    if (response.status === 422) {
                        const data = await response.json();
                        throw { validation: true, errors: data.errors || {}, message: data.message };
                    }

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const data = await response.json().catch(() => ({}));

                    form.classList.remove("lb-submitting");
                    restoreButtonState(submitBtn, btnState, true, config);

                    // Toast notification
                    if (LiveBlade.toast) {
                        LiveBlade.toast.success(form.dataset.lbSuccess || data.message || "Saved successfully");
                    }

                    // Reset form
                    if (config.formResetOnSuccess && form.dataset.lbNoReset !== "true") {
                        form.reset();
                    }

                    // Close modal
                    const closeSelector = form.dataset.lbClose;
                    if (closeSelector && LiveBlade.closeModal) {
                        LiveBlade.closeModal(closeSelector);
                    }

                    // Refresh container
                    const ctrl = LiveBlade.resolve(form);
                    if (ctrl) ctrl.refresh();

                    // Refresh explicit target
                    const refreshTarget = form.dataset.lbRefresh;
                    if (refreshTarget) {
                        const targetCtrl = LiveBlade.getController(refreshTarget);
                        if (targetCtrl) targetCtrl.refresh();
                    }

                    form.dispatchEvent(new CustomEvent("lb:form:success", { detail: { data }, bubbles: true }));
                    LiveBlade.emit("form:success", { data, form });

                } catch (err) {
                    form.classList.remove("lb-submitting");
                    restoreButtonState(submitBtn, btnState, false, config);

                    // Handle validation errors
                    if (err.validation && errorContainer) {
                        const wrapper = document.createElement("div");
                        wrapper.className = "alert alert-danger lb-alert";
                        wrapper.setAttribute("role", "alert");

                        const ul = document.createElement("ul");
                        ul.className = "mb-0 ps-3";

                        Object.entries(err.errors).forEach(([field, messages]) => {
                            (Array.isArray(messages) ? messages : [messages]).forEach((msg) => {
                                const li = document.createElement("li");
                                li.textContent = msg;
                                ul.appendChild(li);

                                // Highlight invalid field
                                const input = form.querySelector(`[name="${cssEscape(field)}"]`);
                                if (input) {
                                    input.classList.add("is-invalid");
                                    input.addEventListener("input", () => input.classList.remove("is-invalid"), { once: true });
                                }
                            });
                        });

                        wrapper.appendChild(ul);
                        errorContainer.appendChild(wrapper);

                        // Focus first invalid field
                        const firstInvalid = form.querySelector(".is-invalid");
                        if (firstInvalid) firstInvalid.focus();

                    } else if (errorContainer) {
                        const div = document.createElement("div");
                        div.className = "alert alert-danger lb-alert";
                        div.textContent = err.message || "An error occurred";
                        errorContainer.appendChild(div);
                    }

                    // Toast notification
                    if (LiveBlade.toast) {
                        LiveBlade.toast.error(err.message || "An error occurred");
                    }

                    form.dispatchEvent(new CustomEvent("lb:form:error", { detail: { error: err }, bubbles: true }));
                    LiveBlade.emit("form:error", { error: err, form });
                }
            });
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("forms", FormsFeature);
        window.LiveBlade.registerBinder("form", FormBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { FormsFeature, FormBinder };
    }

})(window, document);
