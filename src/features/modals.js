/**
 * LiveBlade Feature: Modal Utilities
 * Helper functions for closing modals (Bootstrap 4, 5, and plain CSS)
 */

;(function (window, document) {
    "use strict";

    const ModalUtils = {
        init(LiveBlade) {
            LiveBlade.closeModal = this.closeModal.bind(this);
            LiveBlade.modal = this;
        },

        /**
         * Close a modal by selector
         * Supports Bootstrap 5, Bootstrap 4/jQuery, and plain CSS fallback
         */
        closeModal(selector) {
            const modal = document.querySelector(selector);
            if (!modal) return false;

            // Bootstrap 5
            if (window.bootstrap?.Modal) {
                const bsModal = window.bootstrap.Modal.getInstance(modal);
                if (bsModal) {
                    bsModal.hide();
                    return true;
                }
            }

            // Bootstrap 4 / jQuery
            if (typeof jQuery !== "undefined" && jQuery.fn.modal) {
                jQuery(modal).modal("hide");
                return true;
            }

            // Plain CSS fallback
            modal.style.display = "none";
            modal.classList.remove("show");
            modal.setAttribute("aria-hidden", "true");
            document.body.classList.remove("modal-open");

            // Remove backdrop
            document.querySelectorAll(".modal-backdrop").forEach((b) => b.remove());

            // Dispatch custom event
            modal.dispatchEvent(new CustomEvent("lb:modal:closed", { bubbles: true }));

            if (window.LiveBlade) {
                window.LiveBlade.emit("modal:closed", { selector, modal });
            }

            return true;
        },

        /**
         * Open a modal by selector (Bootstrap only)
         */
        openModal(selector) {
            const modal = document.querySelector(selector);
            if (!modal) return false;

            // Bootstrap 5
            if (window.bootstrap?.Modal) {
                const bsModal = window.bootstrap.Modal.getOrCreateInstance(modal);
                bsModal.show();
                return true;
            }

            // Bootstrap 4 / jQuery
            if (typeof jQuery !== "undefined" && jQuery.fn.modal) {
                jQuery(modal).modal("show");
                return true;
            }

            // Plain CSS fallback
            modal.style.display = "block";
            modal.classList.add("show");
            modal.setAttribute("aria-hidden", "false");
            document.body.classList.add("modal-open");

            modal.dispatchEvent(new CustomEvent("lb:modal:opened", { bubbles: true }));

            if (window.LiveBlade) {
                window.LiveBlade.emit("modal:opened", { selector, modal });
            }

            return true;
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("modals", ModalUtils);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = ModalUtils;
    }

})(window, document);
