/**
 * LiveBlade Feature: Sort Binder
 * Clickable table column sorting
 */

;(function (window) {
    "use strict";

    const SortBinder = {
        selector: "[data-lb-sort]",

        bind(el, LiveBlade) {
            const handleSort = () => {
                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;

                const field = el.dataset.lbSort;
                const currentDir = ctrl.params.sort === field && ctrl.params.dir === "asc" ? "desc" : "asc";

                ctrl.updateParam("sort", field);
                ctrl.updateParam("dir", currentDir);
                ctrl.resetPage();

                // Update visual indicators on all sort headers
                const table = el.closest("table");
                if (table) {
                    table.querySelectorAll("[data-lb-sort]").forEach((th) => {
                        th.removeAttribute("aria-sort");
                        th.classList.remove("lb-sort-asc", "lb-sort-desc");
                    });
                }

                // Set current sort indicator
                el.setAttribute("aria-sort", currentDir === "asc" ? "ascending" : "descending");
                el.classList.add(currentDir === "asc" ? "lb-sort-asc" : "lb-sort-desc");

                ctrl.refresh();
            };

            el.addEventListener("click", handleSort);

            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSort();
                }
            });

            // Make sortable and accessible
            el.style.cursor = "pointer";
            if (!el.getAttribute("tabindex")) el.setAttribute("tabindex", "0");
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("sort", SortBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = SortBinder;
    }

})(window);
