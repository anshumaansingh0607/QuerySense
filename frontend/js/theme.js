/**
 * QuerySense — Theme Manager
 * Dark/Light mode toggle with system preference detection and localStorage persistence.
 */

const ThemeManager = {
    STORAGE_KEY: 'querysense-theme',
    
    init() {
        // Apply saved theme or detect system preference
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            this.setTheme(saved, false);
        } else {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.setTheme(prefersDark ? 'dark' : 'light', false);
        }

        // Listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem(this.STORAGE_KEY)) {
                this.setTheme(e.matches ? 'dark' : 'light', false);
            }
        });
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        this.setTheme(next, true);
    },

    setTheme(theme, animate = true) {
        if (animate) {
            document.documentElement.classList.add('theme-transitioning');
            setTimeout(() => {
                document.documentElement.classList.remove('theme-transitioning');
            }, 400);
        }
        
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(this.STORAGE_KEY, theme);
        
        // Update toggle button icon
        const btn = document.getElementById('btn-theme-toggle');
        if (btn) {
            btn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
            btn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        }

        // Update meta theme-color
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.content = theme === 'dark' ? '#0a0e1a' : '#f8fafc';
        }
    },

    getTheme() {
        return document.documentElement.getAttribute('data-theme') || 'dark';
    }
};

// Initialize ASAP to prevent FOUC (Flash of Unstyled Content)
ThemeManager.init();
