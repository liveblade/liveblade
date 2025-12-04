/**
 * LiveBlade Feature: Quick Search
 * Autocomplete/typeahead search with dropdown results
 *
 * Usage:
 *   <input data-lb-quick-search="/users/search" data-lb-target="#results" data-lb-min="2">
 *   <div id="results"></div>
 *
 * Options (data attributes):
 *   data-lb-quick-search  - URL to fetch results (required)
 *   data-lb-target        - Selector for results container (required)
 *   data-lb-min           - Minimum characters to trigger search (default: 1)
 *   data-lb-delay         - Debounce delay in ms (default: 300)
 *   data-lb-param         - Query parameter name (default: "q")
 *   data-lb-hidden        - Selector for hidden input to store selected ID
 *   data-lb-display       - Property to display in input after selection (default: "title")
 *   data-lb-template      - Template: "default" or "avatar" (default: "default")
 *
 * Server Response (JSON array):
 *   [{ "id": 1, "title": "John Doe", "subtitle": "john@example.com", "picture": "/img/john.jpg" }, ...]
 * 
 * Supported field names (in priority order):
 *   - id: id
 *   - title: title, text, name, label
 *   - subtitle: subtitle, description, email
 *   - picture: picture, avatar, image, img
 */

;(function (window, document) {
    "use strict";

    /**
     * Get title from item (supports multiple field names)
     */
    function getTitle(item) {
        return item.title ?? item.text ?? item.name ?? item.label ?? '';
    }

    /**
     * Get subtitle from item
     */
    function getSubtitle(item) {
        return item.subtitle ?? item.description ?? item.email ?? '';
    }

    /**
     * Get picture from item
     */
    function getPicture(item) {
        return item.picture ?? item.avatar ?? item.image ?? item.img ?? '';
    }

    /**
     * Default item renderer (title + subtitle, no picture)
     */
    function renderDefault(item) {
        const title = getTitle(item);
        const subtitle = getSubtitle(item);
        
        let html = `<div class="lb-qs-content">`;
        html += `<div class="lb-qs-title">${escapeHtml(title)}</div>`;
        if (subtitle) {
            html += `<div class="lb-qs-subtitle">${escapeHtml(subtitle)}</div>`;
        }
        html += `</div>`;
        return html;
    }

    /**
     * Avatar item renderer (picture + title + subtitle)
     */
    function renderAvatar(item) {
        const title = getTitle(item);
        const subtitle = getSubtitle(item);
        const picture = getPicture(item);
        const initials = title.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        let pictureHtml;
        if (picture) {
            pictureHtml = `<img src="${escapeHtml(picture)}" alt="" class="lb-qs-picture">`;
        } else {
            pictureHtml = `<div class="lb-qs-picture lb-qs-initials">${initials}</div>`;
        }

        let html = `
            ${pictureHtml}
            <div class="lb-qs-content">
                <div class="lb-qs-title">${escapeHtml(title)}</div>
                ${subtitle ? `<div class="lb-qs-subtitle">${escapeHtml(subtitle)}</div>` : ''}
            </div>
        `;
        return html;
    }

    /**
     * Escape HTML
     */
    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * Quick Search Controller
     */
    function QuickSearchController(input, LiveBlade) {
        this.input = input;
        this.LiveBlade = LiveBlade;
        this.url = input.dataset.lbQuickSearch;
        this.targetSelector = input.dataset.lbTarget;
        this.target = document.querySelector(this.targetSelector);
        this.minChars = parseInt(input.dataset.lbMin, 10) || 1;
        this.delay = parseInt(input.dataset.lbDelay, 10) || 300;
        this.paramName = input.dataset.lbParam || 'q';
        this.hiddenSelector = input.dataset.lbHidden;
        this.displayProp = input.dataset.lbDisplay || 'title';
        this.template = input.dataset.lbTemplate || 'default';

        this.abortController = null;
        this.debounceTimer = null;
        this.selectedIndex = -1;
        this.items = [];
        this.isOpen = false;

        this._init();
    }

    QuickSearchController.prototype._init = function () {
        if (!this.target) {
            this.LiveBlade.utils.warn('Quick Search: Target not found:', this.targetSelector);
            return;
        }

        // Add classes
        this.target.classList.add('lb-quick-search-results');
        this.input.classList.add('lb-quick-search-input');

        // Wrap in container for positioning if not already
        if (!this.input.parentElement.classList.contains('lb-quick-search-wrapper')) {
            const wrapper = document.createElement('div');
            wrapper.className = 'lb-quick-search-wrapper';
            this.input.parentNode.insertBefore(wrapper, this.input);
            wrapper.appendChild(this.input);
            wrapper.appendChild(this.target);
        }

        // Event listeners
        this.input.addEventListener('input', this._onInput.bind(this));
        this.input.addEventListener('keydown', this._onKeydown.bind(this));
        this.input.addEventListener('focus', this._onFocus.bind(this));
        this.input.addEventListener('blur', this._onBlur.bind(this));
        this.target.addEventListener('mousedown', this._onResultClick.bind(this));

        // ARIA attributes
        this.input.setAttribute('role', 'combobox');
        this.input.setAttribute('aria-autocomplete', 'list');
        this.input.setAttribute('aria-expanded', 'false');
        this.target.setAttribute('role', 'listbox');
    };

    QuickSearchController.prototype._onInput = function (e) {
        const query = e.target.value.trim();

        // Clear selection
        this._clearHidden();

        if (query.length < this.minChars) {
            this._hideResults();
            return;
        }

        // Debounce
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this._search(query), this.delay);
    };

    QuickSearchController.prototype._onKeydown = function (e) {
        if (!this.isOpen) {
            if (e.key === 'ArrowDown' && this.input.value.length >= this.minChars) {
                this._search(this.input.value.trim());
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this._navigate(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this._navigate(-1);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    this._selectItem(this.items[this.selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                this._hideResults();
                break;
            case 'Tab':
                this._hideResults();
                break;
        }
    };

    QuickSearchController.prototype._onFocus = function () {
        if (this.items.length > 0 && this.input.value.length >= this.minChars) {
            this._showResults();
        }
    };

    QuickSearchController.prototype._onBlur = function () {
        // Delay to allow click on results
        setTimeout(() => this._hideResults(), 150);
    };

    QuickSearchController.prototype._onResultClick = function (e) {
        const item = e.target.closest('.lb-qs-item');
        if (!item) return;

        e.preventDefault();
        const index = parseInt(item.dataset.index, 10);
        if (this.items[index]) {
            this._selectItem(this.items[index]);
        }
    };

    QuickSearchController.prototype._search = async function (query) {
        // Abort previous request
        if (this.abortController) {
            this.abortController.abort();
        }
        this.abortController = new AbortController();

        // Build URL
        const url = new URL(this.url, window.location.href);
        url.searchParams.set(this.paramName, query);

        // Show loading state
        this.input.classList.add('lb-qs-loading');

        try {
            const response = await fetch(url.toString(), {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': this.LiveBlade.getCsrf()
                },
                credentials: 'same-origin',
                signal: this.abortController.signal
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            this.items = Array.isArray(data) ? data : (data.data ?? data.results ?? data.items ?? []);

            this._renderResults();
            this._showResults();

            this.LiveBlade.emit('quicksearch:results', { input: this.input, query, items: this.items });

        } catch (err) {
            if (err.name === 'AbortError') return;
            this.LiveBlade.utils.error('Quick Search error:', err);
            this._hideResults();
        } finally {
            this.input.classList.remove('lb-qs-loading');
        }
    };

    QuickSearchController.prototype._renderResults = function () {
        if (this.items.length === 0) {
            this.target.innerHTML = '<div class="lb-qs-empty">No results found</div>';
            return;
        }

        const renderer = this.template === 'avatar' ? renderAvatar : renderDefault;

        this.target.innerHTML = this.items.map((item, index) => {
            const content = renderer(item);
            return `
                <div class="lb-qs-item" data-index="${index}" data-id="${escapeHtml(item.id ?? '')}" role="option">
                    ${content}
                </div>
            `;
        }).join('');

        this.selectedIndex = -1;
    };

    QuickSearchController.prototype._navigate = function (direction) {
        const items = this.target.querySelectorAll('.lb-qs-item');
        if (items.length === 0) return;

        // Remove current highlight
        if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
            items[this.selectedIndex].classList.remove('lb-qs-active');
        }

        // Calculate new index
        this.selectedIndex += direction;
        if (this.selectedIndex < 0) this.selectedIndex = items.length - 1;
        if (this.selectedIndex >= items.length) this.selectedIndex = 0;

        // Highlight new item
        const active = items[this.selectedIndex];
        active.classList.add('lb-qs-active');
        active.scrollIntoView({ block: 'nearest' });

        this.input.setAttribute('aria-activedescendant', `lb-qs-item-${this.selectedIndex}`);
    };

    QuickSearchController.prototype._selectItem = function (item) {
        // Get display value (title is primary)
        const displayValue = item[this.displayProp] ?? item.title ?? item.text ?? item.name ?? item.label ?? '';

        // Set input value
        this.input.value = displayValue;

        // Set hidden input if configured
        if (this.hiddenSelector) {
            const hidden = document.querySelector(this.hiddenSelector);
            if (hidden) {
                hidden.value = item.id ?? '';
            }
        }

        this._hideResults();

        // Emit event
        this.LiveBlade.emit('quicksearch:select', { input: this.input, item });

        // Dispatch DOM event
        this.input.dispatchEvent(new CustomEvent('lb:quicksearch:select', {
            detail: { item },
            bubbles: true
        }));
    };

    QuickSearchController.prototype._showResults = function () {
        if (this.items.length === 0 && !this.target.innerHTML) return;

        this.target.classList.add('lb-qs-open');
        this.input.setAttribute('aria-expanded', 'true');
        this.isOpen = true;
    };

    QuickSearchController.prototype._hideResults = function () {
        this.target.classList.remove('lb-qs-open');
        this.input.setAttribute('aria-expanded', 'false');
        this.isOpen = false;
        this.selectedIndex = -1;
    };

    QuickSearchController.prototype._clearHidden = function () {
        if (this.hiddenSelector) {
            const hidden = document.querySelector(this.hiddenSelector);
            if (hidden) hidden.value = '';
        }
    };

    QuickSearchController.prototype.clear = function () {
        this.input.value = '';
        this._clearHidden();
        this._hideResults();
        this.items = [];
    };

    /**
     * Feature registration
     */
    const QuickSearchFeature = {
        init(LiveBlade) {
            LiveBlade.QuickSearchController = QuickSearchController;
        }
    };

    /**
     * Quick Search Binder
     */
    const QuickSearchBinder = {
        selector: '[data-lb-quick-search]',

        bind(el, LiveBlade) {
            if (el._lbQuickSearch) return;
            el._lbQuickSearch = new QuickSearchController(el, LiveBlade);
        }
    };

    // Register feature and binder
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature('quick-search', QuickSearchFeature);
        window.LiveBlade.registerBinder('quick-search', QuickSearchBinder);
    }

    // Export for module systems
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { QuickSearchController, QuickSearchFeature, QuickSearchBinder };
    }

})(window, document);