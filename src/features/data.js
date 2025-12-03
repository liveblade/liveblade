/**
 * LiveBlade Feature: Data Binder
 * Displays live JSON data with optional auto-refresh
 */

;(function (window) {
    "use strict";

    const DataBinder = {
        selector: '[data-lb="data"], [data-lb-data]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            const url = el.dataset.lbFetch || el.dataset.lbData;
            if (!url || !sameOrigin(url)) return;

            const update = async () => {
                try {
                    const response = await fetch(url, {
                        headers: {
                            "X-Requested-With": "XMLHttpRequest",
                            "X-CSRF-TOKEN": LiveBlade.getCsrf(),
                            "Accept": "application/json"
                        },
                        credentials: "same-origin"
                    });

                    if (!response.ok) throw new Error(`HTTP ${response.status}`);

                    const data = await response.json();

                    // Try to find the value in various places
                    const value = data?.value ?? data?.count ?? data?.total ??
                        Object.values(data || {}).find((v) => typeof v === "number" || typeof v === "string");

                    if (value !== undefined) {
                        el.textContent = value;
                        el.classList.remove("lb-data-error");
                    }

                    LiveBlade.emit("data:updated", { el, data });

                } catch (err) {
                    el.classList.add("lb-data-error");
                    if (!el.textContent) el.textContent = "—";
                    LiveBlade.emit("data:error", { el, error: err });
                }
            };

            // Initial fetch
            update();

            // Set up interval if configured
            const interval = parseInt(el.dataset.lbInterval, 10);
            if (interval > 0) {
                el._lbDataTimer = setInterval(update, interval * 1000);
            }
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("data", DataBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = DataBinder;
    }

})(window);
