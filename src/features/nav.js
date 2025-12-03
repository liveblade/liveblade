/**
 * LiveBlade Feature: Nav Binder
 * Navigation links that load content into a container
 */

;(function (window) {
    "use strict";

    const NavBinder = {
        selector: '[data-lb="nav"], [data-lb-nav]',

        bind(el, LiveBlade) {
            const { sameOrigin } = LiveBlade.utils;

            const handler = (e) => {
                if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();

                const ctrl = LiveBlade.resolve(el);
                if (!ctrl) return;

                const url = el.dataset.lbFetch || el.getAttribute("href");
                if (!url || !sameOrigin(url)) return;

                ctrl.setUrl(url);
                ctrl.refresh();

                // Update active state
                const nav = el.closest(".nav, [data-lb-nav-group]");
                if (nav) {
                    nav.querySelectorAll(".active").forEach((a) => a.classList.remove("active"));
                }
                el.classList.add("active");
            };

            el.addEventListener("click", handler);
            el.addEventListener("keydown", handler);

            // Accessibility
            if (!el.getAttribute("tabindex")) el.setAttribute("tabindex", "0");
            if (!el.getAttribute("role")) el.setAttribute("role", "button");
        }
    };

    // Register binder
    if (window.LiveBlade) {
        window.LiveBlade.registerBinder("nav", NavBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = NavBinder;
    }

})(window);
