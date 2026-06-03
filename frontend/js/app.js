/**
 * QuerySense — Main Application Controller
 * Coordinates state, events, and data flow between API and UI.
 */

const app = {
    // ── State ──
    currentQuery: '',
    currentResult: null,
    isProcessing: false,
    schemaTablesCache: null,
    _abortController: null,
    _pendingProviderSwitch: null,

    // ── Initialization ──
    async init() {
        UI.init();
        VoiceInput.init();
        this.bindEvents();
        
        // Load initial data — don't break if one fails
        try { await this.loadSchemaPanel(); } catch(e) { console.error('Schema load failed:', e); }
        try { await this.loadHistory(); } catch(e) { console.error('History load failed:', e); }
        try { await this.checkHealth(); } catch(e) { console.error('Health check failed:', e); }
        try { await this.loadConfig(); } catch(e) { console.error('Config load failed:', e); }
    },

    // ── Event Binding ──
    bindEvents() {
        // Submit button
        UI.el.btnSubmit.addEventListener('click', () => this.handleSubmit());

        // Ctrl+Enter shortcut
        UI.el.queryInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.handleSubmit();
            }
        });

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => UI.switchTab(btn.dataset.tab));
        });

        // Copy SQL
        UI.el.btnCopySql.addEventListener('click', () => UI.copySql());

        // Sample queries
        document.querySelectorAll('.sample-query').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.el.queryInput.value = btn.dataset.query;
                UI.el.queryInput.focus();
            });
        });

        // Schema actions
        document.getElementById('btn-refresh-schema').addEventListener('click', () => this.refreshSchema());

        // Clarification modal
        document.getElementById('btn-modal-submit').addEventListener('click', () => this.handleClarification());
        document.getElementById('btn-modal-skip').addEventListener('click', () => this.handleClarificationSkip());

        // Modal input enter key
        UI.el.modalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleClarification();
            }
            if (e.key === 'Escape') {
                UI.hideClarificationModal();
            }
        });

        // Escape to close any modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                UI.hideClarificationModal();
                this.closeERDiagram();
                this.closeAnalytics();
                this.closeApiKeyModal();
                this.closeSidebar();
            }
        });

        // ── Theme toggle ──
        const btnTheme = document.getElementById('btn-theme-toggle');
        if (btnTheme) {
            btnTheme.addEventListener('click', () => ThemeManager.toggle());
        }

        // ── Mobile sidebar toggle ──
        const btnMenu = document.getElementById('btn-mobile-menu');
        if (btnMenu) {
            btnMenu.addEventListener('click', () => this.toggleSidebar());
        }

        const sidebarOverlay = document.getElementById('sidebar-overlay');
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => this.closeSidebar());
        }

        // ── Voice ──
        const btnVoice = document.getElementById('btn-voice');
        if (btnVoice) {
            btnVoice.addEventListener('click', () => VoiceInput.toggle());
            if (!VoiceInput.supported) {
                btnVoice.style.display = 'none';
            }
        }

        // ── Export ──
        document.getElementById('btn-export-csv').addEventListener('click', () => {
            if (this.currentResult && this.currentResult.result) {
                ExportManager.toCSV(this.currentResult.result, this.currentResult.columns);
            }
        });
        document.getElementById('btn-export-json').addEventListener('click', () => {
            if (this.currentResult && this.currentResult.result) {
                ExportManager.toJSON(this.currentResult.result);
            }
        });
        document.getElementById('btn-export-sql').addEventListener('click', () => {
            if (this.currentResult && this.currentResult.sql) {
                ExportManager.toSQL(this.currentResult.sql);
            }
        });

        // ── ER Diagram ──
        document.getElementById('btn-show-erd').addEventListener('click', () => this.openERDiagram());
        document.getElementById('btn-close-erd').addEventListener('click', () => this.closeERDiagram());

        // ── Analytics ──
        document.getElementById('btn-show-analytics').addEventListener('click', () => this.openAnalytics());
        document.getElementById('btn-close-analytics').addEventListener('click', () => this.closeAnalytics());

        // Close modals on overlay click
        document.getElementById('erd-modal').addEventListener('click', (e) => {
            if (e.target.id === 'erd-modal') this.closeERDiagram();
        });
        document.getElementById('analytics-modal').addEventListener('click', (e) => {
            if (e.target.id === 'analytics-modal') this.closeAnalytics();
        });

        // ── API Key Modal ──
        const btnApiKeySubmit = document.getElementById('btn-apikey-submit');
        const btnApiKeyCancel = document.getElementById('btn-apikey-cancel');
        const apikeyInput = document.getElementById('apikey-input');
        
        if (btnApiKeySubmit) {
            btnApiKeySubmit.addEventListener('click', () => this.submitApiKey());
        }
        if (btnApiKeyCancel) {
            btnApiKeyCancel.addEventListener('click', () => this.closeApiKeyModal());
        }
        if (apikeyInput) {
            apikeyInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submitApiKey();
                }
                if (e.key === 'Escape') {
                    this.closeApiKeyModal();
                }
            });
        }
        
        const apikeyModal = document.getElementById('apikey-modal');
        if (apikeyModal) {
            apikeyModal.addEventListener('click', (e) => {
                if (e.target.id === 'apikey-modal') this.closeApiKeyModal();
            });
        }

        // ── LLM Mode Selector ──
        const modeSelect = document.getElementById('llm-mode-select');
        if (modeSelect) {
            modeSelect.addEventListener('change', (e) => this.switchProvider(e.target.value));
        }
    },

    // ── Mobile Sidebar ──
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const btn = document.getElementById('btn-mobile-menu');
        
        const isOpen = sidebar.classList.toggle('open');
        overlay.classList.toggle('active', isOpen);
        btn.classList.toggle('active', isOpen);
    },

    closeSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebar-overlay');
        const btn = document.getElementById('btn-mobile-menu');
        
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        if (btn) btn.classList.remove('active');
    },

    // ── Query Submission ──
    async handleSubmit() {
        const query = UI.el.queryInput.value.trim();
        if (!query || this.isProcessing) return;

        // Abort previous request if still running
        if (this._abortController) {
            this._abortController.abort();
        }
        this._abortController = new AbortController();

        this.currentQuery = query;
        this.isProcessing = true;

        UI.showLoading('Analyzing your query...');

        // Pipeline stage indicators
        this._stageTimeouts = this._stageTimeouts || [];
        this._stageTimeouts.forEach(t => clearTimeout(t));
        this._stageTimeouts = [];

        const stages = [
            { name: 'schema', delay: 200 },
            { name: 'ambiguity', delay: 500 },
            { name: 'generation', delay: 900 },
            { name: 'validation', delay: 1200 },
            { name: 'execution', delay: 1500 },
        ];

        stages.forEach(s => {
            const t = setTimeout(() => {
                if (this.isProcessing) {
                    UI.updatePipelineStage(s.name, 'active');
                    const stageTexts = {
                        schema: 'Checking schema for drift...',
                        ambiguity: 'Scoring query clarity...',
                        generation: 'Generating SQL with LLM...',
                        validation: 'Validating SQL...',
                        execution: 'Executing query...',
                    };
                    UI.el.loadingText.textContent = stageTexts[s.name] || 'Processing...';
                }
            }, s.delay);
            this._stageTimeouts.push(t);
        });

        try {
            const result = await api.submitQuery(query, 'sales_db', this._abortController.signal);

            // Check if clarification is needed
            if (result.clarification && result.clarification.needs_clarification) {
                UI.showClarificationModal(
                    result.clarification.question,
                    result.clarification.ambiguities
                );
                return;
            }

            // Store result for export
            this.currentResult = result;

            // Update analytics
            Analytics.updateFromResult(result);

            // Check for success
            if (result.success) {
                UI.showResults(result);
            } else {
                UI.showError(result.error || 'Query execution failed after all retry attempts.');
            }

            // Refresh history
            await this.loadHistory();

        } catch (error) {
            if (error.name !== 'AbortError') {
                UI.showError(error.message);
            }
        } finally {
            this.isProcessing = false;
            this._abortController = null;
        }
    },

    // ── Clarification Handling ──
    async handleClarification() {
        const clarification = UI.el.modalInput.value.trim();
        if (!clarification) {
            UI.el.modalInput.style.borderColor = 'var(--error)';
            setTimeout(() => { UI.el.modalInput.style.borderColor = ''; }, 1500);
            return;
        }

        UI.hideClarificationModal();
        UI.showLoading('Generating SQL with your clarification...');
        this.isProcessing = true;

        try {
            const result = await api.submitClarification(this.currentQuery, clarification);
            this.currentResult = result;
            Analytics.updateFromResult(result);

            if (result.success) {
                UI.showResults(result);
            } else {
                UI.showError(result.error || 'Query failed even with clarification.');
            }

            await this.loadHistory();
        } catch (error) {
            UI.showError(error.message);
        } finally {
            this.isProcessing = false;
        }
    },

    async handleClarificationSkip() {
        UI.hideClarificationModal();
        UI.showLoading('Generating SQL (skipping clarification)...');
        this.isProcessing = true;

        try {
            const result = await api.submitClarification(this.currentQuery, 'Proceed with reasonable defaults');
            this.currentResult = result;
            Analytics.updateFromResult(result);

            if (result.success) {
                UI.showResults(result);
            } else {
                UI.showError(result.error || 'Query failed.');
            }

            await this.loadHistory();
        } catch (error) {
            UI.showError(error.message);
        } finally {
            this.isProcessing = false;
        }
    },

    // ── Rerun Query ──
    rerunQuery(query) {
        UI.el.queryInput.value = query;
        this.handleSubmit();
    },

    // ── Schema Operations ──
    async loadSchemaPanel() {
        try {
            const data = await api.getSchemaTables();
            this.schemaTablesCache = data.tables;
            // Hide skeleton loader
            const skeleton = document.getElementById('schema-skeleton');
            if (skeleton) skeleton.style.display = 'none';
            UI.renderSchemaPanel(data.tables);
        } catch (error) {
            console.error('Failed to load schema:', error);
            const skeleton = document.getElementById('schema-skeleton');
            if (skeleton) skeleton.innerHTML = '<p style="color: var(--text-tertiary); font-size: var(--text-xs); padding: var(--space-3);">Failed to load schema</p>';
        }
    },

    async refreshSchema() {
        try {
            await api.refreshSchema();
            UI.hideDriftAlert();
            await this.loadSchemaPanel();
        } catch (error) {
            console.error('Schema refresh failed:', error);
        }
    },

    // ── History ──
    async loadHistory() {
        try {
            const data = await api.getHistory();
            UI.renderHistory(data.history);
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    },

    // ── Health Check ──
    async checkHealth() {
        try {
            const health = await api.healthCheck();
            UI.updateModeDisplay(health.llm_provider, health.llm_provider);
        } catch (error) {
            console.error('Health check failed:', error);
        }
    },

    // ── Config / Provider ──
    async loadConfig() {
        try {
            const config = await api.getConfig();
            const select = document.getElementById('llm-mode-select');
            if (select && config.provider_id) {
                select.value = config.provider_id;
            }
            // Update available options
            if (config.available_providers && select) {
                const currentOptions = Array.from(select.options).map(o => o.value);
                config.available_providers.forEach(p => {
                    if (!currentOptions.includes(p)) {
                        const opt = document.createElement('option');
                        opt.value = p;
                        opt.textContent = p === 'openai' ? '🤖 OpenAI' : p === 'anthropic' ? '🧠 Anthropic' : p;
                        select.appendChild(opt);
                    }
                });
            }
        } catch (error) {
            console.error('Config load failed:', error);
        }
    },

    async switchProvider(provider) {
        try {
            let result;
            try {
                result = await api.switchProvider(provider, null);
            } catch (error) {
                if (error.message.toLowerCase().includes('api key')) {
                    // Show API Key modal instead of window.prompt()
                    this._pendingProviderSwitch = provider;
                    this.showApiKeyModal(provider);
                    return;
                } else {
                    throw error;
                }
            }

            if (result.status === 'switched') {
                UI.updateModeDisplay(result.provider, result.provider_id);
            }
        } catch (error) {
            console.error('Provider switch failed:', error);
            const select = document.getElementById('llm-mode-select');
            if (select) select.value = 'mock';
            UI.showError('Failed to switch provider: ' + error.message);
        }
    },

    // ── API Key Modal ──
    showApiKeyModal(provider) {
        const modal = document.getElementById('apikey-modal');
        const desc = document.getElementById('apikey-modal-desc');
        const input = document.getElementById('apikey-input');
        
        const providerName = provider === 'openai' ? 'OpenAI' : provider === 'groq' ? 'Groq' : provider.charAt(0).toUpperCase() + provider.slice(1);
        desc.textContent = `Enter your ${providerName} API key to connect.`;
        input.value = '';
        input.placeholder = provider === 'groq' ? 'gsk_...' : 'sk-...';
        
        modal.classList.add('visible');
        setTimeout(() => input.focus(), 200);
    },

    closeApiKeyModal() {
        const modal = document.getElementById('apikey-modal');
        modal.classList.remove('visible');
        
        // Reset provider select if we were switching
        if (this._pendingProviderSwitch) {
            const select = document.getElementById('llm-mode-select');
            if (select) select.value = 'mock';
            this._pendingProviderSwitch = null;
        }
    },

    async submitApiKey() {
        const input = document.getElementById('apikey-input');
        const apiKey = input.value.trim();
        
        if (!apiKey) {
            input.style.borderColor = 'var(--error)';
            setTimeout(() => { input.style.borderColor = ''; }, 1500);
            return;
        }

        const provider = this._pendingProviderSwitch;
        this.closeApiKeyModal();
        this._pendingProviderSwitch = null;

        try {
            const result = await api.switchProvider(provider, apiKey);
            if (result.status === 'switched') {
                UI.updateModeDisplay(result.provider, result.provider_id);
                const select = document.getElementById('llm-mode-select');
                if (select) select.value = provider;
            }
        } catch (error) {
            console.error('Provider switch with key failed:', error);
            const select = document.getElementById('llm-mode-select');
            if (select) select.value = 'mock';
            UI.showError('Failed to connect: ' + error.message);
        }
    },

    // ══════════════════════════════════
    //  ER Diagram
    // ══════════════════════════════════
    openERDiagram() {
        const modal = document.getElementById('erd-modal');
        modal.classList.add('visible');

        // Initialize after modal is visible and has dimensions
        setTimeout(() => {
            ERDiagram.init('erd-canvas');
            if (this.schemaTablesCache) {
                ERDiagram.loadSchema(this.schemaTablesCache);
            }
        }, 150);
    },

    closeERDiagram() {
        document.getElementById('erd-modal').classList.remove('visible');
    },

    // ══════════════════════════════════
    //  Analytics Dashboard
    // ══════════════════════════════════
    openAnalytics() {
        const modal = document.getElementById('analytics-modal');
        modal.classList.add('visible');
        Analytics.render('analytics-container');
    },

    closeAnalytics() {
        document.getElementById('analytics-modal').classList.remove('visible');
    },
};

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => app.init());
