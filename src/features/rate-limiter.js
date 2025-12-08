/**
 * LiveBlade Feature: Rate Limiter
 * Prevents excessive requests to the same URL
 */

;(function (window) {
    "use strict";

    const RateLimiter = {
        requests: new Map(),
        maxRequests: 100,
        windowMs: 60000,
        cleanupInterval: null,

        init(LiveBlade) {
            if (this.cleanupInterval) return;
            this.cleanupInterval = setInterval(() => this.cleanup(), this.windowMs);

            // Cleanup on page unload
            window.addEventListener('beforeunload', () => this.destroy());
            window.addEventListener('pagehide', () => this.destroy());

            // Expose on LiveBlade
            LiveBlade.rateLimiter = this;
        },

        cleanup() {
            const now = Date.now();
            for (const [key, list] of this.requests) {
                const recent = list.filter((ts) => now - ts < this.windowMs);
                if (recent.length === 0) {
                    this.requests.delete(key);
                } else {
                    this.requests.set(key, recent);
                }
            }
        },

        canRequest(key) {
            const now = Date.now();
            const list = this.requests.get(key) || [];
            const recent = list.filter((ts) => now - ts < this.windowMs);

            if (recent.length >= this.maxRequests) {
                if (window.LiveBlade) {
                    window.LiveBlade.utils.log("Rate limit exceeded:", key);
                }
                return false;
            }

            recent.push(now);
            this.requests.set(key, recent);
            return true;
        },

        reset(key) {
            if (key) {
                this.requests.delete(key);
            } else {
                this.requests.clear();
            }
        },

        destroy() {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            this.requests.clear();
        }
    };

    // Register feature
    if (window.LiveBlade) {
        window.LiveBlade.registerFeature("rate-limiter", RateLimiter);
    }

    // Export for module systems
    if (typeof module !== "undefined" && module.exports) {
        module.exports = RateLimiter;
    }

})(window);