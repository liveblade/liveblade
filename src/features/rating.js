/**
 * LiveBlade Feature: Star Rating
 * Interactive star rating with optional POST to server
 *
 * Usage:
 *   <!-- Basic (display only) -->
 *   <div data-lb-rating data-lb-value="3"></div>
 *
 *   <!-- Interactive with POST -->
 *   <div data-lb-rating 
 *        data-lb-value="3" 
 *        data-lb-fetch="/products/1/rate"
 *        data-lb-param="rating">
 *   </div>
 *
 *   <!-- Custom max stars -->
 *   <div data-lb-rating data-lb-value="7" data-lb-max="10"></div>
 *
 *   <!-- Read-only -->
 *   <div data-lb-rating data-lb-value="4.5" data-lb-readonly></div>
 *
 * Options (data attributes):
 *   data-lb-rating    - Marks as rating component (required)
 *   data-lb-value     - Current rating value (default: 0)
 *   data-lb-max       - Maximum stars (default: 5)
 *   data-lb-fetch     - URL to POST rating (optional)
 *   data-lb-param     - Parameter name for rating (default: "rating")
 *   data-lb-readonly  - Disable interaction
 *   data-lb-half      - Allow half-star ratings
 *   data-lb-size      - Size: "sm", "md", "lg" (default: "md")
 *
 * Events:
 *   lb:rating:change  - When rating changes (before POST)
 *   lb:rating:success - After successful POST
 *   lb:rating:error   - On POST error
 */

;(function (window, document) {
    "use strict";

    // Star SVG icons
    const starFull = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    const starEmpty = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    const starHalf = `<svg viewBox="0 0 24 24"><defs><linearGradient id="half"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="transparent"/></linearGradient></defs><path fill="url(#half)" stroke="currentColor" stroke-width="2" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;

    /**
     * Rating Controller
     */
    function RatingController(el, LiveBlade) {
        this.container = el;
        this.LiveBlade = LiveBlade;
        this.value = parseFloat(el.dataset.lbValue) || 0;
        this.max = parseInt(el.dataset.lbMax, 10) || 5;
        this.url = el.dataset.lbFetch;
        this.paramName = el.dataset.lbParam || 'rating';
        this.readonly = el.hasAttribute('data-lb-readonly');
        this.allowHalf = el.hasAttribute('data-lb-half');
        this.size = el.dataset.lbSize || 'md';
        this.hoverValue = null;

        this._init();
    }

    RatingController.prototype._init = function () {
        // Add classes
        this.container.classList.add('lb-rating');
        this.container.classList.add('lb-rating-' + this.size);
        if (this.readonly) {
            this.container.classList.add('lb-rating-readonly');
        }

        // Create stars
        this._render();

        // Event listeners (if not readonly)
        if (!this.readonly) {
            this.container.addEventListener('mousemove', this._onMouseMove.bind(this));
            this.container.addEventListener('mouseleave', this._onMouseLeave.bind(this));
            this.container.addEventListener('click', this._onClick.bind(this));
            this.container.addEventListener('keydown', this._onKeyDown.bind(this));
            this.container.setAttribute('tabindex', '0');
            this.container.setAttribute('role', 'slider');
            this.container.setAttribute('aria-valuemin', '0');
            this.container.setAttribute('aria-valuemax', this.max.toString());
            this.container.setAttribute('aria-valuenow', this.value.toString());
            this.container.setAttribute('aria-label', 'Rating');
        }
    };

    RatingController.prototype._render = function () {
        const displayValue = this.hoverValue !== null ? this.hoverValue : this.value;
        let html = '';

        for (let i = 1; i <= this.max; i++) {
            const starClass = 'lb-rating-star';
            let starIcon;

            if (displayValue >= i) {
                starIcon = starFull;
            } else if (this.allowHalf && displayValue >= i - 0.5) {
                starIcon = starHalf;
            } else {
                starIcon = starEmpty;
            }

            html += `<span class="${starClass}" data-value="${i}">${starIcon}</span>`;
        }

        this.container.innerHTML = html;
    };

    RatingController.prototype._getValueFromEvent = function (e) {
        const star = e.target.closest('.lb-rating-star');
        if (!star) return null;

        let value = parseInt(star.dataset.value, 10);

        // Calculate half star if enabled
        if (this.allowHalf) {
            const rect = star.getBoundingClientRect();
            const x = e.clientX - rect.left;
            if (x < rect.width / 2) {
                value -= 0.5;
            }
        }

        return value;
    };

    RatingController.prototype._onMouseMove = function (e) {
        const value = this._getValueFromEvent(e);
        if (value !== null && value !== this.hoverValue) {
            this.hoverValue = value;
            this._render();
        }
    };

    RatingController.prototype._onMouseLeave = function () {
        this.hoverValue = null;
        this._render();
    };

    RatingController.prototype._onClick = function (e) {
        const value = this._getValueFromEvent(e);
        if (value !== null) {
            this._setValue(value);
        }
    };

    RatingController.prototype._onKeyDown = function (e) {
        let newValue = this.value;
        const step = this.allowHalf ? 0.5 : 1;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowUp':
                e.preventDefault();
                newValue = Math.min(this.max, this.value + step);
                break;
            case 'ArrowLeft':
            case 'ArrowDown':
                e.preventDefault();
                newValue = Math.max(0, this.value - step);
                break;
            case 'Home':
                e.preventDefault();
                newValue = 0;
                break;
            case 'End':
                e.preventDefault();
                newValue = this.max;
                break;
            default:
                return;
        }

        if (newValue !== this.value) {
            this._setValue(newValue);
        }
    };

    RatingController.prototype._setValue = async function (value) {
        const oldValue = this.value;
        this.value = value;
        this.hoverValue = null;
        this._render();

        // Update ARIA
        this.container.setAttribute('aria-valuenow', value.toString());

        // Update data attribute
        this.container.dataset.lbValue = value.toString();

        // Emit change event
        const changeEvent = new CustomEvent('lb:rating:change', {
            detail: { element: this.container, value, oldValue },
            bubbles: true,
            cancelable: true
        });
        this.container.dispatchEvent(changeEvent);

        if (changeEvent.defaultPrevented) {
            // Revert if prevented
            this.value = oldValue;
            this._render();
            return;
        }

        // POST to server if URL provided
        if (this.url) {
            await this._postRating(value, oldValue);
        }
    };

    RatingController.prototype._postRating = async function (value, oldValue) {
        this.container.classList.add('lb-rating-loading');

        try {
            const body = {};
            body[this.paramName] = value;

            const response = await fetch(this.url, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': this.LiveBlade.getCsrf()
                },
                credentials: 'same-origin',
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // Success
            this.container.classList.remove('lb-rating-loading');
            this.container.classList.add('lb-rating-success');

            this.container.dispatchEvent(new CustomEvent('lb:rating:success', {
                detail: { element: this.container, value, data },
                bubbles: true
            }));

            setTimeout(() => {
                this.container.classList.remove('lb-rating-success');
            }, 1000);

        } catch (err) {
            console.error('Rating error:', err);

            // Revert value
            this.value = oldValue;
            this._render();

            this.container.classList.remove('lb-rating-loading');
            this.container.classList.add('lb-rating-error');

            this.container.dispatchEvent(new CustomEvent('lb:rating:error', {
                detail: { element: this.container, error: err },
                bubbles: true
            }));

            setTimeout(() => {
                this.container.classList.remove('lb-rating-error');
            }, 2000);
        }
    };

    /**
     * Public method to get value
     */
    RatingController.prototype.getValue = function () {
        return this.value;
    };

    /**
     * Public method to set value programmatically
     */
    RatingController.prototype.setValue = function (value) {
        this._setValue(value);
    };

    /**
     * Rating Binder
     */
    const RatingBinder = {
        selector: '[data-lb-rating]',

        bind(el, LiveBlade) {
            if (el._lbRating) return;
            el._lbRating = new RatingController(el, LiveBlade);
        }
    };

    /**
     * Feature registration
     */
    const RatingFeature = {
        init(LiveBlade) {
            LiveBlade.RatingController = RatingController;
        }
    };

    // Register
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('rating', RatingFeature);
        window.LiveBlade.registerBinder('rating', RatingBinder);
    }

    // Export
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RatingController, RatingFeature, RatingBinder };
    }

})(window, document);