/**
 * LiveBlade Feature: Bulk Actions
 * Select multiple items and perform bulk operations
 */

;(function (window, document) {
    "use strict";

    /**
     * Bulk Action Controller
     */
    function BulkActionController(el, LiveBlade) {
        this.el = el;
        this.LiveBlade = LiveBlade;
        this.action = el.dataset.lbBulkAction;
        this.url = el.dataset.lbUrl;
        this.method = (el.dataset.lbMethod || "POST").toUpperCase();
        this.confirmMsg = el.dataset.lbConfirm;
        this.container = el.closest("[data-lb-bulk-container]") ||
                         el.closest('[data-lb="html"]') ||
                         el.closest("[data-lb-html]") ||
                         document;
        this.checkboxSelector = el.dataset.lbCheckbox || "[data-lb-bulk-item]";
    }

    BulkActionController.prototype.execute = async function () {
        const { error } = this.LiveBlade.utils;
        const config = this.LiveBlade.config;

        // Get selected items
        const checkboxes = this.container.querySelectorAll(this.checkboxSelector + ":checked");
        const ids = Array.from(checkboxes).map((cb) => cb.value || cb.dataset.id).filter(Boolean);

        if (ids.length === 0) {
            if (this.LiveBlade.toast) {
                this.LiveBlade.toast.warning("Please select at least one item");
            }
            return;
        }

        // Confirmation
        const confirmMsg = this.confirmMsg || `Are you sure you want to ${this.action} ${ids.length} item(s)?`;
        if (!window.confirm(confirmMsg)) return;

        // Button loading state
        const btnState = this.LiveBlade.forms?.saveButtonState(this.el);
        if (btnState && this.LiveBlade.forms) {
            this.LiveBlade.forms.setButtonLoading(this.el, btnState);
        } else {
            this.el.disabled = true;
        }

        // Mark rows as processing
        checkboxes.forEach((cb) => {
            const row = cb.closest("tr") || cb.closest("[data-lb-row]");
            if (row) row.classList.add("lb-bulk-processing");
        });

        try {
            const response = await fetch(this.url, {
                method: this.method,
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRF-TOKEN": this.LiveBlade.getCsrf(),
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({ action: this.action, ids }),
                credentials: "same-origin"
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            const data = await response.json().catch(() => ({}));

            // Restore button
            if (btnState && this.LiveBlade.forms) {
                this.LiveBlade.forms.restoreButtonState(this.el, btnState, true);
            } else {
                this.el.disabled = false;
            }

            // Clear selection
            checkboxes.forEach((cb) => {
                cb.checked = false;
                const row = cb.closest("tr") || cb.closest("[data-lb-row]");
                if (row) row.classList.remove("lb-bulk-processing", "lb-bulk-selected");
            });

            // Clear select-all checkbox
            const selectAll = this.container.querySelector("[data-lb-bulk-select-all]");
            if (selectAll) {
                selectAll.checked = false;
                selectAll.indeterminate = false;
            }

            // Toast notification
            if (this.LiveBlade.toast) {
                this.LiveBlade.toast.success(data.message || `${ids.length} item(s) processed`);
            }

            // Refresh container
            const ctrl = this.LiveBlade.resolve(this.el);
            if (ctrl) ctrl.refresh();

            this.LiveBlade.emit("bulk:success", { action: this.action, ids, response: data });

        } catch (err) {
            error("Bulk action failed:", err);

            // Restore button
            if (btnState && this.LiveBlade.forms) {
                this.LiveBlade.forms.restoreButtonState(this.el, btnState, false);
            } else {
                this.el.disabled = false;
            }

            // Remove processing state
            checkboxes.forEach((cb) => {
                const row = cb.closest("tr") || cb.closest("[data-lb-row]");
                if (row) row.classList.remove("lb-bulk-processing");
            });

            // Toast notification
            if (this.LiveBlade.toast) {
                this.LiveBlade.toast.error(err.message || "Bulk action failed");
            }

            this.LiveBlade.emit("bulk:error", { action: this.action, error: err });
        }
    };

    /**
     * Feature registration
     */
    const BulkActionsFeature = {
        init(LiveBlade) {
            LiveBlade.BulkActionController = BulkActionController;
        }
    };

    /**
     * Bulk Action Button Binder
     */
    const BulkActionBinder = {
        selector: "[data-lb-bulk-action]",

        bind(el, LiveBlade) {
            el.addEventListener("click", (e) => {
                e.preventDefault();
                new BulkActionController(el, LiveBlade).execute();
            });
        }
    };

    /**
     * Select All Checkbox Binder
     */
    const BulkSelectAllBinder = {
        selector: "[data-lb-bulk-select-all]",

        bind(el, LiveBlade) {
            el.addEventListener("change", () => {
                const container = el.closest("[data-lb-bulk-container]") ||
                                  el.closest('[data-lb="html"]') || document;
                const selector = el.dataset.lbTarget || "[data-lb-bulk-item]";

                container.querySelectorAll(selector).forEach((cb) => {
                    cb.checked = el.checked;
                    const row = cb.closest("tr") || cb.closest("[data-lb-row]");
                    if (row) row.classList.toggle("lb-bulk-selected", el.checked);
                });

                LiveBlade.emit("bulk:selectAll", { checked: el.checked });
            });
        }
    };

    /**
     * Individual Item Checkbox Binder
     */
    const BulkItemBinder = {
        selector: "[data-lb-bulk-item]",

        bind(el, LiveBlade) {
            el.addEventListener("change", () => {
                const row = el.closest("tr") || el.closest("[data-lb-row]");
                if (row) row.classList.toggle("lb-bulk-selected", el.checked);

                // Update select-all checkbox state
                const container = el.closest("[data-lb-bulk-container]") ||
                                  el.closest('[data-lb="html"]') || document;
                const selectAll = container.querySelector("[data-lb-bulk-select-all]");

                if (selectAll) {
                    const all = container.querySelectorAll("[data-lb-bulk-item]");
                    const checked = container.querySelectorAll("[data-lb-bulk-item]:checked");
                    selectAll.checked = all.length > 0 && all.length === checked.length;
                    selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
                }
            });
        }
    };

    // Register feature and binders
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("bulk-actions", BulkActionsFeature);
        window.LiveBlade.registerBinder("bulk-action", BulkActionBinder);
        window.LiveBlade.registerBinder("bulk-select-all", BulkSelectAllBinder);
        window.LiveBlade.registerBinder("bulk-item", BulkItemBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = {
            BulkActionController,
            BulkActionsFeature,
            BulkActionBinder,
            BulkSelectAllBinder,
            BulkItemBinder
        };
    }

})(window, document);
