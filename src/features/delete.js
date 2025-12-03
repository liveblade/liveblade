/**
 * LiveBlade Feature: Delete with Undo
 * Soft delete with undo window before permanent deletion
 */

;(function (window, document) {
    "use strict";

    // Pending deletes storage
    const pendingDeletes = new Map();

    /**
     * Delete Controller
     */
    function DeleteController(el, LiveBlade) {
        this.el = el;
        this.LiveBlade = LiveBlade;
        this.url = el.dataset.lbDelete;
        this.confirmMsg = el.dataset.lbConfirm;
        this.row = el.closest("tr") || el.closest("[data-lb-row]") || el.closest(".lb-deletable");
        this.undoTimeoutId = null;
        this.toastId = null;
    }

    DeleteController.prototype.execute = async function () {
        // Confirmation prompt
        if (this.confirmMsg && !window.confirm(this.confirmMsg)) return;

        if (!this.row) {
            this.LiveBlade.utils.warn("Delete: Could not find row");
            return;
        }

        const { uniqueId } = this.LiveBlade.utils;
        const config = this.LiveBlade.config;

        const rowId = uniqueId("delete");
        const originalHTML = this.row.outerHTML;
        const originalParent = this.row.parentNode;
        const originalNextSibling = this.row.nextSibling;

        // Animate out
        this.row.classList.add("lb-row-deleting");

        // Store for potential undo
        pendingDeletes.set(rowId, {
            html: originalHTML,
            parent: originalParent,
            nextSibling: originalNextSibling,
            abortController: null
        });

        // Remove from DOM after animation
        setTimeout(() => {
            if (this.row.parentNode) this.row.remove();
        }, 300);

        // Show undo toast
        const undoDuration = config.deleteUndoDuration || 30000;

        if (this.LiveBlade.toast) {
            this.toastId = this.LiveBlade.toast.warning("Item deleted", {
                duration: undoDuration,
                action: {
                    text: `Undo (${Math.round(undoDuration / 1000)}s)`,
                    onClick: () => this._undo(rowId)
                }
            });
        }

        // Set up abort controller for the delete request
        const abortController = new AbortController();
        pendingDeletes.get(rowId).abortController = abortController;

        // Delay actual delete to allow undo
        this.undoTimeoutId = setTimeout(() => this._performDelete(rowId, abortController), 1000);

        this.LiveBlade.emit("delete:start", { el: this.el, url: this.url, rowId });
    };

    DeleteController.prototype._undo = function (rowId) {
        const pending = pendingDeletes.get(rowId);
        if (!pending) return;

        // Cancel pending delete
        if (this.undoTimeoutId) clearTimeout(this.undoTimeoutId);
        if (pending.abortController) pending.abortController.abort();

        // Restore row
        const temp = document.createElement("div");
        temp.innerHTML = pending.html;
        const restoredRow = temp.firstElementChild;

        if (pending.nextSibling) {
            pending.parent.insertBefore(restoredRow, pending.nextSibling);
        } else {
            pending.parent.appendChild(restoredRow);
        }

        this.LiveBlade.bind(restoredRow);

        // Animate restored
        restoredRow.classList.add("lb-row-restored");
        setTimeout(() => restoredRow.classList.remove("lb-row-restored"), 500);

        pendingDeletes.delete(rowId);

        if (this.LiveBlade.toast) {
            this.LiveBlade.toast.success("Restored");
        }

        this.LiveBlade.emit("delete:undo", { rowId });
    };

    DeleteController.prototype._performDelete = async function (rowId, abortController) {
        const pending = pendingDeletes.get(rowId);
        if (!pending) return;

        const { error } = this.LiveBlade.utils;

        try {
            const response = await fetch(this.url, {
                method: "DELETE",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRF-TOKEN": this.LiveBlade.getCsrf(),
                    "Accept": "application/json"
                },
                signal: abortController.signal,
                credentials: "same-origin"
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            pendingDeletes.delete(rowId);

            // Refresh container
            const ctrl = this.LiveBlade.resolve(this.el);
            if (ctrl) ctrl.refresh();

            this.LiveBlade.emit("delete:success", { url: this.url, rowId });

        } catch (err) {
            if (err.name === "AbortError") return;

            error("Delete failed:", err);
            this._undo(rowId);

            if (this.LiveBlade.toast) {
                this.LiveBlade.toast.error("Failed to delete: " + err.message);
            }

            this.LiveBlade.emit("delete:error", { url: this.url, error: err, rowId });
        }
    };

    /**
     * Feature registration
     */
    const DeleteFeature = {
        config: {
            deleteUndoDuration: 30000,
            deleteConfirmDefault: "Are you sure you want to delete this item?"
        },

        init(LiveBlade) {
            Object.assign(LiveBlade.config, this.config);
            LiveBlade.DeleteController = DeleteController;
            LiveBlade.pendingDeletes = pendingDeletes;
        }
    };

    /**
     * Delete Binder
     */
    const DeleteBinder = {
        selector: "[data-lb-delete]",

        bind(el, LiveBlade) {
            el.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                new DeleteController(el, LiveBlade).execute();
            });
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("delete", DeleteFeature);
        window.LiveBlade.registerBinder("delete", DeleteBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { DeleteController, DeleteFeature, DeleteBinder };
    }

})(window, document);
