/**
 * LiveBlade Feature: State Preservation
 * Saves and restores scroll position, focus state, and input values
 */

;(function (window) {
    "use strict";

    const StateManager = {
        init(LiveBlade) {
            LiveBlade.state = this;
        },

        /**
         * Scroll Position
         */
        saveScrollPosition(el) {
            return { top: el.scrollTop, left: el.scrollLeft };
        },

        restoreScrollPosition(el, pos) {
            if (!pos) return;
            el.scrollTop = pos.top;
            el.scrollLeft = pos.left;
        },

        /**
         * Focus State
         */
        saveFocusState(root) {
            const active = document.activeElement;
            if (!active || !root.contains(active)) return null;
            return {
                id: active.id,
                name: active.name,
                selectionStart: active.selectionStart,
                selectionEnd: active.selectionEnd
            };
        },

        restoreFocusState(root, state) {
            if (!state) return;

            const cssEscape = window.LiveBlade?.utils?.cssEscape || ((s) => s);
            let el = null;

            if (state.id) el = root.querySelector(`#${cssEscape(state.id)}`);
            if (!el && state.name) el = root.querySelector(`[name="${cssEscape(state.name)}"]`);

            if (el?.focus) {
                el.focus();
                if (state.selectionStart != null && el.setSelectionRange) {
                    try { el.setSelectionRange(state.selectionStart, state.selectionEnd); } catch {}
                }
            }
        },

        /**
         * Input Values
         */
        saveInputStates(root) {
            const inputs = root.querySelectorAll("input, textarea, select");
            const states = [];
            const cssEscape = window.LiveBlade?.utils?.cssEscape || ((s) => s);

            inputs.forEach((input) => {
                const id = input.id;
                const name = input.name;

                let selector = null;
                if (id) {
                    selector = `#${cssEscape(id)}`;
                } else if (name) {
                    const tag = input.tagName.toLowerCase();
                    selector = `${tag}[name="${cssEscape(name)}"]`;
                    if (input.type === "radio") selector += `[value="${cssEscape(input.value)}"]`;
                }

                if (!selector) return;

                const state = { selector, tagName: input.tagName };

                if (input.type === "checkbox") {
                    state.type = "checkbox";
                    state.checked = input.checked;
                } else if (input.type === "radio") {
                    state.type = "radio";
                    state.checked = input.checked;
                } else if (input.tagName === "SELECT") {
                    state.type = "select";
                    state.value = input.value;
                    state.selectedIndex = input.selectedIndex;
                    if (input.multiple) {
                        state.selectedValues = Array.from(input.selectedOptions).map((o) => o.value);
                    }
                } else {
                    state.type = "text";
                    state.value = input.value;
                }

                states.push(state);
            });

            return states;
        },

        restoreInputStates(root, states, skipActiveElement = true) {
            if (!states?.length) return;

            states.forEach((state) => {
                const input = root.querySelector(state.selector);
                if (!input) return;
                if (skipActiveElement && document.activeElement === input) return;

                if (state.type === "checkbox" || state.type === "radio") {
                    input.checked = state.checked;
                } else if (state.type === "select") {
                    if (state.selectedValues && input.multiple) {
                        Array.from(input.options).forEach((opt) => {
                            opt.selected = state.selectedValues.includes(opt.value);
                        });
                    } else {
                        input.value = state.value;
                        if (input.value !== state.value && state.selectedIndex >= 0) {
                            input.selectedIndex = state.selectedIndex;
                        }
                    }
                } else {
                    input.value = state.value;
                }
            });
        },

        /**
         * Save all states at once
         */
        saveAll(root, config = {}) {
            return {
                scroll: config.preserveScroll !== false ? this.saveScrollPosition(root) : null,
                focus: config.preserveFocus !== false ? this.saveFocusState(root) : null,
                inputs: config.preserveInputs !== false ? this.saveInputStates(root) : null
            };
        },

        /**
         * Restore all states at once
         */
        restoreAll(root, saved) {
            if (!saved) return;
            this.restoreScrollPosition(root, saved.scroll);
            this.restoreInputStates(root, saved.inputs);
            this.restoreFocusState(root, saved.focus);
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("state", StateManager);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = StateManager;
    }

})(window);
