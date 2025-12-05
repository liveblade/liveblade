/**
 * LiveBlade Feature: Cascade Select
 * Cascading/dependent dropdowns that load options from API
 *
 * Usage:
 *   <!-- Parent -->
 *   <select data-lb-cascade 
 *           data-lb-fetch="/api/countries/{value}/states" 
 *           data-lb-target="#state-select"
 *           data-lb-loading="Loading states..."
 *           name="country">
 *       <option value="">Select Country</option>
 *       <option value="CA">Canada</option>
 *       <option value="US">United States</option>
 *   </select>
 *
 *   <!-- Child -->
 *   <select id="state-select" name="state">
 *       <option value="">Select State</option>
 *   </select>
 *
 * Options (data attributes):
 *   data-lb-cascade       - Marks this as a cascade parent (required)
 *   data-lb-fetch         - URL with {value} placeholder (required)
 *   data-lb-target        - Selector for child select (required)
 *   data-lb-placeholder   - Placeholder text for child (default: "Select...")
 *   data-lb-loading       - Loading text (default: "Loading...")
 *   data-lb-error         - Error text (default: "Error loading options")
 *   data-lb-value-field   - JSON field for option value (default: "id")
 *   data-lb-text-field    - JSON field for option text (default: "name")
 *   data-lb-selected      - Pre-select this value after loading
 *
 * Server Response (JSON array):
 *   [{ "id": "QC", "name": "Quebec" }, { "id": "ON", "name": "Ontario" }]
 *
 * Events:
 *   lb:cascade:loading  - When fetch starts
 *   lb:cascade:loaded   - When options are loaded
 *   lb:cascade:error    - When fetch fails
 *   lb:cascade:reset    - When child is reset
 */

;(function (window, document) {
    "use strict";

    /**
     * Cascade Controller
     */
    function CascadeController(el, LiveBlade) {
        this.parent = el;
        this.LiveBlade = LiveBlade;
        this.urlTemplate = el.dataset.lbFetch;
        this.targetSelector = el.dataset.lbTarget;
        this.child = document.querySelector(this.targetSelector);
        
        // Options
        this.placeholder = el.dataset.lbPlaceholder || 'Select...';
        this.loadingText = el.dataset.lbLoading || 'Loading...';
        this.errorText = el.dataset.lbError || 'Error loading options';
        this.valueField = el.dataset.lbValueField || 'id';
        this.textField = el.dataset.lbTextField || 'name';
        this.preselectedValue = el.dataset.lbSelected || null;
        
        // State
        this.abortController = null;
        this.originalPlaceholder = null;
        this.cache = {};

        this._init();
    }

    CascadeController.prototype._init = function () {
        if (!this.child) {
            console.warn('LiveBlade Cascade: Target not found:', this.targetSelector);
            return;
        }

        if (!this.urlTemplate) {
            console.warn('LiveBlade Cascade: data-lb-fetch is required');
            return;
        }

        // Store original placeholder from child's first option
        if (this.child.options.length > 0 && this.child.options[0].value === '') {
            this.originalPlaceholder = this.child.options[0].text;
        } else {
            this.originalPlaceholder = this.placeholder;
        }

        // Initial state - disable child if parent has no value
        if (!this.parent.value) {
            this._resetChild();
        } else {
            // Parent has initial value, load child options
            this._loadOptions(this.parent.value);
        }

        // Listen for parent changes
        this.parent.addEventListener('change', this._onChange.bind(this));
    };

    CascadeController.prototype._onChange = function (e) {
        const value = e.target.value;

        if (!value) {
            this._resetChild();
            return;
        }

        this._loadOptions(value);
    };

    CascadeController.prototype._loadOptions = async function (value) {
        // Check cache first
        if (this.cache[value]) {
            this._populateOptions(this.cache[value]);
            return;
        }

        // Abort previous request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // Build URL
        const url = this.urlTemplate.replace('{value}', encodeURIComponent(value));

        // Show loading state
        this._setLoading(true);

        // Emit loading event
        this._emit('lb:cascade:loading', { parent: this.parent, child: this.child, value });

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': this.LiveBlade.getCsrf()
                },
                credentials: 'same-origin',
                signal: this.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Handle different response formats
            const options = Array.isArray(data) ? data : (data.data ?? data.options ?? data.items ?? []);

            // Cache the results
            this.cache[value] = options;

            // Populate child select
            this._populateOptions(options);

            // Emit loaded event
            this._emit('lb:cascade:loaded', { 
                parent: this.parent, 
                child: this.child, 
                value, 
                options 
            });

        } catch (err) {
            if (err.name === 'AbortError') return;

            console.error('LiveBlade Cascade error:', err);
            this._setError();

            // Emit error event
            this._emit('lb:cascade:error', { 
                parent: this.parent, 
                child: this.child, 
                error: err 
            });
        }
    };

    CascadeController.prototype._populateOptions = function (options) {
        // Clear existing options
        this.child.innerHTML = '';

        // Add placeholder
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = this.originalPlaceholder;
        this.child.appendChild(placeholder);

        // Add options
        options.forEach(item => {
            const option = document.createElement('option');
            option.value = item[this.valueField] ?? item.id ?? item.value ?? '';
            option.textContent = item[this.textField] ?? item.name ?? item.text ?? item.label ?? '';
            
            // Check for preselected value
            if (this.preselectedValue && option.value === this.preselectedValue) {
                option.selected = true;
                // Clear preselected after first use (for subsequent changes)
                this.preselectedValue = null;
            }
            
            this.child.appendChild(option);
        });

        // Enable child
        this.child.disabled = false;
        this.child.classList.remove('lb-cascade-loading', 'lb-cascade-error');

        // Trigger change event on child if value was preselected
        if (this.child.value) {
            this.child.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    CascadeController.prototype._resetChild = function () {
        // Clear options
        this.child.innerHTML = '';

        // Add placeholder
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = this.originalPlaceholder;
        this.child.appendChild(placeholder);

        // Disable child
        this.child.disabled = true;
        this.child.classList.remove('lb-cascade-loading', 'lb-cascade-error');

        // Emit reset event
        this._emit('lb:cascade:reset', { parent: this.parent, child: this.child });

        // If child is also a cascade parent, reset its children too
        if (this.child.dataset.lbCascade !== undefined) {
            this.child.dispatchEvent(new Event('change', { bubbles: true }));
        }
    };

    CascadeController.prototype._setLoading = function (loading) {
        if (loading) {
            this.child.disabled = true;
            this.child.classList.add('lb-cascade-loading');
            this.child.classList.remove('lb-cascade-error');

            // Show loading text
            this.child.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = this.loadingText;
            this.child.appendChild(option);
        }
    };

    CascadeController.prototype._setError = function () {
        this.child.disabled = true;
        this.child.classList.remove('lb-cascade-loading');
        this.child.classList.add('lb-cascade-error');

        // Show error text
        this.child.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = this.errorText;
        this.child.appendChild(option);
    };

    CascadeController.prototype._emit = function (eventName, detail) {
        this.parent.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true
        }));

        this.child.dispatchEvent(new CustomEvent(eventName, {
            detail,
            bubbles: true
        }));
    };

    /**
     * Public method to clear cache
     */
    CascadeController.prototype.clearCache = function () {
        this.cache = {};
    };

    /**
     * Public method to reload current selection
     */
    CascadeController.prototype.reload = function () {
        const value = this.parent.value;
        if (value) {
            delete this.cache[value];
            this._loadOptions(value);
        }
    };

    /**
     * Feature registration
     */
    const CascadeFeature = {
        init(LiveBlade) {
            LiveBlade.CascadeController = CascadeController;
        }
    };

    /**
     * Cascade Binder
     */
    const CascadeBinder = {
        selector: '[data-lb-cascade]',

        bind(el, LiveBlade) {
            if (el._lbCascade) return;
            el._lbCascade = new CascadeController(el, LiveBlade);
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('cascade', CascadeFeature);
        window.LiveBlade.registerBinder('cascade', CascadeBinder);
    }

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { CascadeController, CascadeFeature, CascadeBinder };
    }

})(window, document);