/**
 * LiveBlade Feature: Pagination Binder
 * Handles pagination link clicks within a container
 */

;(function (window) {
    "use strict";

    const PaginationBinder = {
        selector: '[data-lb="pagination"], [data-lb-pagination]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            el.addEventListener("click", (e) => {
                // Find the clicked link
                let link = e.target;
                if (link.tagName !== "A") link = link.closest("a");

                // Validate link
                if (!link?.href || link.href === "#" || link.classList.contains("disabled")) return;

                e.preventDefault();
                e.stopPropagation();

                const ctrl = LiveBlade.resolve(el);
                if (!ctrl || !sameOrigin(link.href)) return;

                ctrl.setUrl(link.href);
                ctrl.navigate();
            });
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("pagination", PaginationBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = PaginationBinder;
    }

})(window);
