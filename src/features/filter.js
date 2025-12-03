/**
 * LiveBlade Feature: Filter Binder
 * Handles select, checkbox, radio, and other filter inputs
 */

;(function (window) {
    "use strict";

    const FilterBinder = {
        selector: [
            '[data-lb="filter"]',
            '[data-lb-filter]',
            '[data-lb="select"]',
            '[data-lb="checkbox"]',
            '[data-lb="radio"]',
            '[data-lb="date"]',
            '[data-lb="time"]',
            '[data-lb="datetime-local"]',
            '[data-lb="month"]',
            '[data-lb="week"]',
            '[data-lb="number"]',
            '[data-lb="range"]',
            '[data-lb="color"]'
        ].join(", "),

        bind(el, LiveBlade) {
            const { throttle } = LiveBlade.utils;

            const handleChange = () => {
                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;

                const key = el.name || el.dataset.lbParam || "filter";
                let value;

                if (el.type === "checkbox") {
                    value = el.checked ? (el.value !== "on" ? el.value : "1") : "";
                } else if (el.type === "radio") {
                    value = el.checked ? el.value : "";
                } else {
                    value = el.value;
                }

                ctrl.updateParam(key, value);
                ctrl.resetPage();
                ctrl.refresh();
            };

            const throttledChange = throttle(handleChange, LiveBlade.config.throttle);

            el.addEventListener("change", throttledChange);
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("filter", FilterBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = FilterBinder;
    }

})(window);
