/**
 * LiveBlade Feature: Toggle Binder
 * Switch/checkbox that sends POST request on change
 */

;(function (window) {
    "use strict";

    const ToggleBinder = {
        selector: '[data-lb="toggle-update"], [data-lb-toggle]',

        bind(el, LiveBlade) {
            const { sameOrigin, error } = LiveBlade.utils;
            const config = LiveBlade.config;

            el.addEventListener("change", async () => {
                const url = el.dataset.lbFetch || el.dataset.lbToggle;
                if (!url || !sameOrigin(url)) return;

                // Confirmation prompt
                if (el.dataset.lbConfirm && !window.confirm(el.dataset.lbConfirm)) {
                    el.checked = !el.checked;
                    return;
                }

                const wrapper = el.closest(".form-check, .form-switch, .lb-toggle");
                const originalChecked = !el.checked;

                if (wrapper) wrapper.classList.add("lb-updating");
                el.disabled = true;

                try {
                    const response = await fetch(url, {
                        method: el.dataset.lbMethod || "POST",
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.getCsrf(),
                            "Content-Type": "application/json",
                            "Accept": "application/json"
                        },
                        body: JSON.stringify({ [el.name || "value"]: el.checked ? 1 : 0 }),
                        credentials: "same-origin"
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    el.disabled = false;

                    if (wrapper) {
                        wrapper.classList.remove("lb-updating");
                        wrapper.classList.add("lb-success");
                        setTimeout(() => wrapper.classList.remove("lb-success"), config.successDuration);
                    }

                    // Refresh container if configured
                    const ctrl = LiveBlade.resolve(el);
                    if (ctrl && el.dataset.lbRefresh !== "false") ctrl.refresh();

                    LiveBlade.emit("toggle:success", { el, checked: el.checked });

                } catch (err) {
                    // Revert on error
                    el.checked = originalChecked;
                    el.disabled = false;

                    if (wrapper) {
                        wrapper.classList.remove("lb-updating");
                        wrapper.classList.add("lb-error");
                        setTimeout(() => wrapper.classList.remove("lb-error"), config.errorDuration);
                    }

                    error("Toggle failed:", err);
                    LiveBlade.emit("toggle:error", { el, error: err });
                }
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("toggle", ToggleBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = ToggleBinder;
    }

})(window);
