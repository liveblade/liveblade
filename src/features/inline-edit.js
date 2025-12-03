/**
 * LiveBlade Feature: Inline Edit
 * Edit table rows or elements inline with save/cancel
 */

;(function (window, document) {
    "use strict";

    /**
     * Inline Edit Controller
     */
    function InlineEditController(row, LiveBlade) {
        this.row = row;
        this.LiveBlade = LiveBlade;
        this.url = row.dataset.lbEdit;
        this.isEditing = false;
        this.originalHTML = null;
        this.originalData = {};
        this.abortController = null;
        this._boundKeyHandler = this._handleKeydown.bind(this);
    }

    InlineEditController.prototype.startEdit = function () {
        if (this.isEditing) return;
        this.isEditing = true;

        const { escapeHtml, cssEscape } = this.LiveBlade.utils;

        this.originalHTML = this.row.innerHTML;
        this.originalData = {};

        const cells = this.row.querySelectorAll("[data-field]");
        cells.forEach((cell) => {
            const field = cell.dataset.field;
            const value = cell.dataset.value ?? cell.textContent.trim();
            const type = cell.dataset.type || "text";

            this.originalData[field] = value;

            let input;
            if (type === "select") {
                input = document.createElement("select");
                input.className = "form-control form-control-sm lb-edit-input";
                input.name = field;

                try {
                    const opts = JSON.parse(cell.dataset.options || "{}");
                    Object.entries(opts).forEach(([k, v]) => {
                        const opt = document.createElement("option");
                        opt.value = k;
                        opt.textContent = v;
                        if (k === value) opt.selected = true;
                        input.appendChild(opt);
                    });
                } catch {}
            } else if (type === "textarea") {
                input = document.createElement("textarea");
                input.className = "form-control form-control-sm lb-edit-input";
                input.name = field;
                input.value = value;
                input.rows = 2;
            } else if (type === "checkbox") {
                input = document.createElement("input");
                input.type = "checkbox";
                input.className = "form-check-input lb-edit-input";
                input.name = field;
                input.checked = value === "1" || value === "true";
            } else {
                input = document.createElement("input");
                input.type = type;
                input.className = "form-control form-control-sm lb-edit-input";
                input.name = field;
                input.value = value;
            }

            cell.innerHTML = "";
            cell.appendChild(input);
            cell.classList.add("lb-editing");
        });

        // Add action buttons
        let actionCell = this.row.querySelector("[data-lb-edit-actions]") ||
                         this.row.querySelector("td:last-child, th:last-child");

        if (actionCell) {
            this._originalActionsHTML = actionCell.innerHTML;
            this._actionCell = actionCell;
            actionCell.innerHTML = `
                <div class="lb-edit-actions">
                    <button type="button" class="btn btn-sm btn-success lb-edit-save" title="Save (Ctrl+Enter)">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </button>
                    <button type="button" class="btn btn-sm btn-secondary lb-edit-cancel" title="Cancel (Esc)">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
            `;

            actionCell.querySelector(".lb-edit-save").addEventListener("click", () => this.save());
            actionCell.querySelector(".lb-edit-cancel").addEventListener("click", () => this.cancel());
        }

        this.row.classList.add("lb-row-editing");

        // Focus first input
        const firstInput = this.row.querySelector(".lb-edit-input");
        if (firstInput) {
            firstInput.focus();
            if (firstInput.select) firstInput.select();
        }

        document.addEventListener("keydown", this._boundKeyHandler);
        this.LiveBlade.emit("edit:start", { row: this.row, url: this.url });
    };

    InlineEditController.prototype._handleKeydown = function (e) {
        if (e.key === "Escape") {
            e.preventDefault();
            this.cancel();
        } else if (e.key === "Enter" && e.ctrlKey) {
            e.preventDefault();
            this.save();
        }
    };

    InlineEditController.prototype.cancel = function () {
        if (!this.isEditing) return;

        document.removeEventListener("keydown", this._boundKeyHandler);
        this.row.innerHTML = this.originalHTML;
        this.row.classList.remove("lb-row-editing");
        this.isEditing = false;

        this.LiveBlade.bind(this.row);
        this.LiveBlade.emit("edit:cancel", { row: this.row });
    };

    InlineEditController.prototype.save = async function () {
        if (!this.isEditing) return;

        const { error } = this.LiveBlade.utils;
        const config = this.LiveBlade.config;

        const newData = {};
        this.row.querySelectorAll(".lb-edit-input").forEach((input) => {
            newData[input.name] = input.type === "checkbox" ? (input.checked ? 1 : 0) : input.value;
        });

        this.row.classList.add("lb-row-saving");
        const saveBtn = this.row.querySelector(".lb-edit-save");
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = config.buttonLoadingIcon || '<svg class="lb-spinner" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="3"/></svg>';
        }

        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        try {
            const response = await fetch(this.url, {
                method: "PATCH",
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRF-TOKEN": this.LiveBlade.getCsrf(),
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify(newData),
                signal: this.abortController.signal,
                credentials: "same-origin"
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            const data = await response.json().catch(() => ({}));

            document.removeEventListener("keydown", this._boundKeyHandler);
            this.row.classList.remove("lb-row-editing", "lb-row-saving");
            this.isEditing = false;

            // Update row content
            if (data.html) {
                const temp = document.createElement("tr");
                temp.innerHTML = data.html;
                this.row.innerHTML = temp.innerHTML;
            } else {
                this.row.querySelectorAll("[data-field]").forEach((cell) => {
                    const field = cell.dataset.field;
                    if (newData[field] !== undefined) {
                        cell.dataset.value = newData[field];
                        cell.textContent = data[field + "_display"] || data[field] || newData[field];
                        cell.classList.remove("lb-editing");
                    }
                });

                if (this._actionCell && this._originalActionsHTML) {
                    this._actionCell.innerHTML = this._originalActionsHTML;
                }
            }

            this.LiveBlade.bind(this.row);

            // Success feedback
            this.row.classList.add("lb-row-success");
            setTimeout(() => this.row.classList.remove("lb-row-success"), config.successDuration);

            if (this.LiveBlade.toast) {
                this.LiveBlade.toast.success(data.message || "Saved successfully");
            }

            this.LiveBlade.emit("edit:success", { row: this.row, data: newData, response: data });

            // Refresh container
            const ctrl = this.LiveBlade.resolve(this.row);
            if (ctrl && this.row.dataset.lbRefresh !== "false") ctrl.refresh();

        } catch (err) {
            if (err.name === "AbortError") return;

            error("Save failed:", err);
            this.row.classList.remove("lb-row-saving");

            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
            }

            this.row.classList.add("lb-row-error");
            setTimeout(() => this.row.classList.remove("lb-row-error"), config.errorDuration);

            if (this.LiveBlade.toast) {
                this.LiveBlade.toast.error(err.message || "Failed to save");
            }

            this.LiveBlade.emit("edit:error", { row: this.row, error: err });
        }
    };

    /**
     * Feature registration
     */
    const InlineEditFeature = {
        init(LiveBlade) {
            LiveBlade.InlineEditController = InlineEditController;
        }
    };

    /**
     * Edit Binder - triggers edit mode
     */
    const EditBinder = {
        selector: "[data-lb-edit]",

        bind(el, LiveBlade) {
            el.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const row = el.closest("tr") || el.closest("[data-lb-row]");
                if (!row) return;

                let ctrl = row._lbEditController;
                if (!ctrl) {
                    ctrl = new InlineEditController(row, LiveBlade);
                    row._lbEditController = ctrl;
                }

                ctrl.startEdit();
            });
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("inline-edit", InlineEditFeature);
        window.LiveBlade.registerBinder("edit", EditBinder);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { InlineEditController, InlineEditFeature, EditBinder };
    }

})(window, document);
