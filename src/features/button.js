/**
 * LiveBlade Feature: Button Binder
 * Refresh and load-more action buttons
 */

;(function (window) {
    "use strict";

    const ButtonBinder = {
        selector: '[data-lb="button"], [data-lb-button], [data-lb-action="refresh"], [data-lb-action="load-more"], [data-lb-action="more"]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            el.addEventListener("click", (e) => {
                e.preventDefault();

                const ctrl = LiveBlade.resolve(el);
                const action = el.dataset.lbAction;

                // Handle refresh action
                if (action === "refresh" && ctrl) {
                    ctrl.refresh();
                    return;
                }

                // Handle load-more action
                if ((action === "load-more" || action === "more") && ctrl) {
                    ctrl.loadMore();
                    return;
                }

                // Handle URL fetch
                const url = el.dataset.lbFetch;
                if (url && sameOrigin(url) && ctrl) {
                    ctrl.setUrl(url);
                    ctrl.refresh();
                }
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("button", ButtonBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = ButtonBinder;
    }

})(window);
