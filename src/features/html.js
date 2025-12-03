/**
 * LiveBlade Feature: HTML Binder
 * Binds data-lb="html" containers to HtmlController
 */

;(function (window) {
    "use strict";

    const HtmlBinder = {
        selector: '[data-lb="html"], [data-lb-html], [data-lb]:not([data-lb="nav"]):not([data-lb="search"]):not([data-lb="filter"]):not([data-lb="button"]):not([data-lb="toggle-update"]):not([data-lb="data"]):not([data-lb="pagination"]):not([data-lb="form"])',

        bind(el, LiveBlade) {
            // Skip if not a container type
            const lbValue = el.getAttribute("data-lb");
            if (lbValue && !lbValue.startsWith("/") && lbValue !== "html") return;

            // Skip if already has controller
            if (LiveBlade.controllers.has(el)) return;

            // Ensure HtmlController is available
            if (!LiveBlade.HtmlController) {
                LiveBlade.utils.warn("HtmlController not available. Include html-controller.js feature.");
                return;
            }

            const ctrl = new LiveBlade.HtmlController(el, LiveBlade);
            LiveBlade.controllers.set(el, ctrl);
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("html", HtmlBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = HtmlBinder;
    }

})(window);
