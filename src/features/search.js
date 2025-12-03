/**
 * LiveBlade Feature: Search Binder
 * Debounced search input that updates container
 */

;(function (window) {
    "use strict";

    const SearchBinder = {
        selector: '[data-lb="search"], [data-lb-search]',

        bind(el, LiveBlade) {
            const { debounce } = LiveBlade.utils;

            const doSearch = () => {
                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;
                ctrl.updateParam(el.name || "search", el.value);
                ctrl.resetPage();
                ctrl.refresh();
            };

            const debouncedSearch = debounce(doSearch, LiveBlade.config.debounce);

            el.addEventListener("input", debouncedSearch);

            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    doSearch();
                }
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("search", SearchBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = SearchBinder;
    }

})(window);
