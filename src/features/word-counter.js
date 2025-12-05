/**
 * LiveBlade Feature: Character/Word Counter
 * Live counter for input fields and textareas
 *
 * Usage:
 *   <!-- Character counter -->
 *   <textarea data-lb-counter data-lb-max="500" data-lb-target="#char-count"></textarea>
 *   <span id="char-count">0/500</span>
 *
 *   <!-- Word counter -->
 *   <textarea data-lb-counter="words" data-lb-max="100" data-lb-target="#word-count"></textarea>
 *   <span id="word-count">0/100 words</span>
 *
 *   <!-- Character counter with warning threshold -->
 *   <textarea data-lb-counter 
 *             data-lb-max="280" 
 *             data-lb-warn="250"
 *             data-lb-target="#tweet-count">
 *   </textarea>
 *   <span id="tweet-count">0/280</span>
 *
 *   <!-- No max limit (just counting) -->
 *   <textarea data-lb-counter data-lb-target="#count"></textarea>
 *   <span id="count">0 characters</span>
 *
 * Options (data attributes):
 *   data-lb-counter   - Type: "chars" (default) or "words"
 *   data-lb-max       - Maximum count (optional, enables limit)
 *   data-lb-min       - Minimum count (optional)
 *   data-lb-warn      - Warning threshold (optional)
 *   data-lb-target    - Selector for counter display (required)
 *   data-lb-format    - Format: "fraction" (0/100), "remaining" (100 left), "count" (0)
 *   data-lb-block     - Block input when max reached (default: false)
 *
 * Events:
 *   lb:counter:update  - When count changes
 *   lb:counter:max     - When max is reached
 *   lb:counter:warn    - When warning threshold is reached
 *   lb:counter:valid   - When count is within limits
 *   lb:counter:invalid - When count exceeds limits
 */

;(function (window, document) {
    "use strict";

    /**
     * Counter Controller
     */
    function CounterController(el, LiveBlade) {
        this.input = el;
        this.LiveBlade = LiveBlade;
        
        // Options
        this.type = el.dataset.lbCounter || 'chars';
        if (this.type === '' || this.type === 'true') this.type = 'chars';
        
        this.max = el.dataset.lbMax ? parseInt(el.dataset.lbMax, 10) : null;
        this.min = el.dataset.lbMin ? parseInt(el.dataset.lbMin, 10) : null;
        this.warn = el.dataset.lbWarn ? parseInt(el.dataset.lbWarn, 10) : null;
        this.targetSelector = el.dataset.lbTarget;
        this.format = el.dataset.lbFormat || 'fraction';
        this.blockInput = el.hasAttribute('data-lb-block');
        
        this.target = document.querySelector(this.targetSelector);
        this.lastCount = 0;

        this._init();
    }

    CounterController.prototype._init = function () {
        if (!this.target) {
            console.warn('LiveBlade Counter: Target not found:', this.targetSelector);
            return;
        }

        // Add class to input
        this.input.classList.add('lb-counter-input');

        // Initial count
        this._update();

        // Listen for input
        this.input.addEventListener('input', this._onInput.bind(this));
        this.input.addEventListener('paste', () => setTimeout(() => this._onInput(), 0));

        // Block input if enabled and has max
        if (this.blockInput && this.max && this.type === 'chars') {
            this.input.addEventListener('keypress', this._onKeyPress.bind(this));
        }
    };

    CounterController.prototype._getCount = function () {
        const value = this.input.value;

        if (this.type === 'words') {
            // Count words (split by whitespace, filter empty)
            const words = value.trim().split(/\s+/).filter(w => w.length > 0);
            return value.trim() === '' ? 0 : words.length;
        } else {
            // Count characters
            return value.length;
        }
    };

    CounterController.prototype._onInput = function () {
        this._update();
    };

    CounterController.prototype._onKeyPress = function (e) {
        // Block new characters if at max (for character counter only)
        if (this.max && this._getCount() >= this.max) {
            // Allow control keys
            if (e.ctrlKey || e.metaKey || e.key === 'Backspace' || e.key === 'Delete') {
                return;
            }
            e.preventDefault();
        }
    };

    CounterController.prototype._update = function () {
        const count = this._getCount();
        const wasOverLimit = this.lastCount > this.max;
        const isOverLimit = this.max && count > this.max;
        const isUnderMin = this.min && count < this.min;
        const isAtWarn = this.warn && count >= this.warn;
        const isAtMax = this.max && count >= this.max;

        // Update display
        this._updateDisplay(count);

        // Update classes
        this._updateClasses(count, isOverLimit, isUnderMin, isAtWarn, isAtMax);

        // Emit events
        if (count !== this.lastCount) {
            this._emit('lb:counter:update', { count, max: this.max, type: this.type });

            if (isAtMax && !wasOverLimit) {
                this._emit('lb:counter:max', { count });
            }

            if (isAtWarn && this.lastCount < this.warn) {
                this._emit('lb:counter:warn', { count, warn: this.warn });
            }

            if (isOverLimit || isUnderMin) {
                this._emit('lb:counter:invalid', { count, max: this.max, min: this.min });
            } else if ((wasOverLimit || (this.min && this.lastCount < this.min)) && !isOverLimit && !isUnderMin) {
                this._emit('lb:counter:valid', { count });
            }
        }

        this.lastCount = count;
    };

    CounterController.prototype._updateDisplay = function (count) {
        let text;
        const typeLabel = this.type === 'words' ? 'words' : 'characters';

        switch (this.format) {
            case 'remaining':
                if (this.max) {
                    const remaining = this.max - count;
                    text = remaining >= 0 
                        ? `${remaining} ${typeLabel} remaining`
                        : `${Math.abs(remaining)} ${typeLabel} over limit`;
                } else {
                    text = `${count} ${typeLabel}`;
                }
                break;

            case 'count':
                text = count.toString();
                break;

            case 'fraction':
            default:
                if (this.max) {
                    text = `${count}/${this.max}`;
                } else {
                    text = `${count} ${typeLabel}`;
                }
                break;
        }

        this.target.textContent = text;
    };

    CounterController.prototype._updateClasses = function (count, isOverLimit, isUnderMin, isAtWarn, isAtMax) {
        // Input classes
        this.input.classList.toggle('lb-counter-warn', isAtWarn && !isOverLimit);
        this.input.classList.toggle('lb-counter-error', isOverLimit || isUnderMin);
        this.input.classList.toggle('lb-counter-max', isAtMax && !isOverLimit);

        // Target classes
        this.target.classList.toggle('lb-counter-warn', isAtWarn && !isOverLimit);
        this.target.classList.toggle('lb-counter-error', isOverLimit || isUnderMin);
        this.target.classList.toggle('lb-counter-max', isAtMax && !isOverLimit);
    };

    CounterController.prototype._emit = function (eventName, detail) {
        this.input.dispatchEvent(new CustomEvent(eventName, {
            detail: { element: this.input, target: this.target, ...detail },
            bubbles: true
        }));
    };

    /**
     * Public method to get count
     */
    CounterController.prototype.getCount = function () {
        return this._getCount();
    };

    /**
     * Public method to check if valid
     */
    CounterController.prototype.isValid = function () {
        const count = this._getCount();
        if (this.max && count > this.max) return false;
        if (this.min && count < this.min) return false;
        return true;
    };

    /**
     * Counter Binder
     */
    const CounterBinder = {
        selector: '[data-lb-counter]',

        bind(el, LiveBlade) {
            if (el._lbCounter) return;
            el._lbCounter = new CounterController(el, LiveBlade);
        }
    };

    /**
     * Feature registration
     */
    const CounterFeature = {
        init(LiveBlade) {
            LiveBlade.CounterController = CounterController;
        }
    };

    // Register
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('counter', CounterFeature);
        window.LiveBlade.registerBinder('counter', CounterBinder);
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CounterController, CounterFeature, CounterBinder };
    }

})(window, document);