/**
 * QuerySense — UI Renderer
 * All DOM manipulation, rendering, and animation utilities.
 * Enhanced with structured reasoning display and correction visualization.
 */

const UI = {
    // ── Element Cache ──
    el: {},

    init() {
        this.el = {
            queryInput: document.getElementById('query-input'),
            btnSubmit: document.getElementById('btn-submit'),
            btnSubmitText: document.getElementById('btn-submit-text'),
            btnSpinner: document.getElementById('btn-spinner'),
            loadingState: document.getElementById('loading-state'),
            loadingText: document.getElementById('loading-text'),
            pipelineStages: document.getElementById('pipeline-stages'),
            resultsSection: document.getElementById('results-section'),
            errorSection: document.getElementById('error-section'),
            errorMessage: document.getElementById('error-message'),
            errorTitleText: document.getElementById('error-title-text'),
            emptyState: document.getElementById('empty-state'),
            sqlCode: document.getElementById('sql-code'),
            dataTableContainer: document.getElementById('data-table-container'),
            rowCount: document.getElementById('row-count'),
            // Note: explanationText, assumptionsList, tablesUsedContainer
            // are not in the HTML — reasoning uses reasoningContainer instead
            correctionSteps: document.getElementById('correction-steps'),
            correctionDiff: document.getElementById('correction-diff'),
            tabCorrections: document.getElementById('tab-corrections'),
            correctionBadge: document.getElementById('correction-badge'),
            resultStats: document.getElementById('result-stats'),
            schemaPanel: document.getElementById('schema-panel'),
            historyPanel: document.getElementById('history-panel'),
            historyEmpty: document.getElementById('history-empty'),

            driftAlert: document.getElementById('drift-alert'),
            driftChangesList: document.getElementById('drift-changes-list'),
            badgeDrift: document.getElementById('badge-drift'),
            driftStatus: document.getElementById('drift-status'),
            modalOverlay: document.getElementById('clarification-modal'),
            modalQuestion: document.getElementById('modal-question'),
            modalAmbiguities: document.getElementById('modal-ambiguities'),
            modalInput: document.getElementById('modal-input'),
            btnCopySql: document.getElementById('btn-copy-sql'),
            statsBar: document.getElementById('stats-bar'),
            reasoningContainer: document.getElementById('reasoning-container'),
        };
    },

    // ── Loading States with Pipeline Stages ──
    showLoading(message = 'Processing your query...') {
        this.el.loadingState.classList.remove('hidden');
        this.el.loadingText.textContent = message;
        this.el.resultsSection.classList.add('hidden');
        this.el.errorSection.classList.add('hidden');
        this.el.emptyState.classList.add('hidden');
        this.el.btnSubmit.disabled = true;
        this.el.btnSubmitText.textContent = 'Processing...';
        this.el.btnSpinner.classList.remove('hidden');

        // Reset pipeline stage indicators
        if (this.el.pipelineStages) {
            this.el.pipelineStages.innerHTML = '';
        }
    },

    updatePipelineStage(stage, status = 'active') {
        if (!this.el.pipelineStages) return;

        const stageNames = {
            'schema': '🗄️ Schema Check',
            'ambiguity': '🎯 Ambiguity Scoring',
            'generation': '🔧 SQL Generation',
            'validation': '✅ SQL Validation',
            'execution': '⚡ Execution',
            'correction': '🔄 Self-Correction',
        };

        const name = stageNames[stage] || stage;
        const existingStage = this.el.pipelineStages.querySelector(`[data-stage="${stage}"]`);

        if (existingStage) {
            existingStage.className = `pipeline-stage ${status}`;
        } else {
            const el = document.createElement('span');
            el.className = `pipeline-stage ${status}`;
            el.dataset.stage = stage;
            el.textContent = name;
            this.el.pipelineStages.appendChild(el);
        }
    },

    hideLoading() {
        this.el.loadingState.classList.add('hidden');
        this.el.btnSubmit.disabled = false;
        this.el.btnSubmitText.textContent = '⚡ Run Query';
        this.el.btnSpinner.classList.add('hidden');
    },

    // ── Results Rendering ──
    showResults(data) {
        this.hideLoading();
        this.el.emptyState.classList.add('hidden');
        this.el.errorSection.classList.add('hidden');
        this.el.resultsSection.classList.remove('hidden');

        // Re-trigger animation
        this.el.resultsSection.style.animation = 'none';
        this.el.resultsSection.offsetHeight; // force reflow
        this.el.resultsSection.style.animation = '';

        // Render SQL
        this.renderSQL(data.sql);



        // Render data table
        this.renderDataTable(data.result, data.columns, data.row_count);

        // Smart Auto-Visualization + Data Insights
        if (typeof SmartViz !== 'undefined') {
            SmartViz.render('viz-container', data.result, data.columns);
        }

        // Render structured reasoning (replaces old explanation)
        this.renderStructuredReasoning(data);

        // Always show corrections tab with badge
        this.renderCorrections(data);

        // Render stats
        this.renderResultStats(data);

        // Show drift alert if detected
        if (data.drift_detected && data.drift_changes) {
            this.showDriftAlert(data.drift_changes);
        }

        // Activate data tab
        this.switchTab('data');
    },

    showError(error) {
        this.hideLoading();
        this.el.emptyState.classList.add('hidden');
        this.el.resultsSection.classList.add('hidden');
        this.el.errorSection.classList.remove('hidden');
        this.el.errorTitleText.textContent = 'Query Failed';
        this.el.errorMessage.textContent = error;
    },

    // ── SQL Rendering with Syntax Highlighting ──
    renderSQL(sql) {
        if (!sql) {
            this.el.sqlCode.innerHTML = '<span style="color: var(--text-tertiary)">No SQL generated</span>';
            return;
        }
        this.el.sqlCode.innerHTML = this.highlightSQL(sql);
    },

    highlightSQL(sql) {
        let highlighted = this.escapeHtml(sql);

        const keywords = [
            'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN',
            'OUTER JOIN', 'CROSS JOIN', 'ON', 'AND', 'OR', 'NOT', 'IN', 'EXISTS',
            'BETWEEN', 'LIKE', 'IS', 'NULL', 'AS', 'ORDER BY', 'GROUP BY', 'HAVING',
            'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'INSERT', 'INTO', 'VALUES',
            'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'ALTER', 'DROP', 'INDEX',
            'PRIMARY KEY', 'FOREIGN KEY', 'REFERENCES', 'DEFAULT', 'NOT NULL',
            'ASC', 'DESC', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'WITH',
        ];

        const functions = [
            'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'COALESCE', 'IFNULL',
            'CAST', 'CONVERT', 'DATE', 'YEAR', 'MONTH', 'DAY', 'NOW', 'CURRENT_DATE',
            'strftime', 'UPPER', 'LOWER', 'LENGTH', 'SUBSTR', 'REPLACE', 'TRIM',
            'ABS', 'RANDOM',
        ];

        highlighted = highlighted.replace(/&#39;([^&#]*(?:&#[0-9]+;[^&#]*)*)&#39;/g,
            '<span class="sql-string">\'$1\'</span>');
        highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g,
            '<span class="sql-number">$1</span>');

        functions.forEach(fn => {
            const regex = new RegExp(`\\b(${fn})\\s*\\(`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="sql-function">$1</span>(');
        });

        const sortedKeywords = keywords.sort((a, b) => b.length - a.length);
        sortedKeywords.forEach(kw => {
            const regex = new RegExp(`\\b(${kw.replace(/ /g, '\\s+')})\\b`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="sql-keyword">$1</span>');
        });

        return highlighted;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },



    // ── Data Table ──
    renderDataTable(data, columns, rowCount) {
        if (!data || data.length === 0) {
            this.el.dataTableContainer.innerHTML = `
                <div style="padding: var(--space-8); text-align: center; color: var(--text-tertiary);">
                    <div style="font-size: 1.5rem; margin-bottom: var(--space-2);">📭</div>
                    Query executed successfully but returned no rows.
                </div>
            `;
            this.el.rowCount.textContent = '0 rows returned';
            return;
        }

        const cols = columns || Object.keys(data[0]);

        let html = '<table class="data-table"><thead><tr>';
        cols.forEach(col => {
            html += `<th data-column="${col}">${this.escapeHtml(col)} <span class="sort-icon">↕</span></th>`;
        });
        html += '</tr></thead><tbody>';

        data.forEach(row => {
            html += '<tr>';
            cols.forEach(col => {
                const val = row[col];
                const display = val === null ? '<span style="color:var(--text-tertiary)">NULL</span>' : this.escapeHtml(String(val));
                html += `<td title="${this.escapeHtml(String(val ?? ''))}">${display}</td>`;
            });
            html += '</tr>';
        });

        html += '</tbody></table>';
        this.el.dataTableContainer.innerHTML = html;
        this.el.rowCount.innerHTML = `<span>📊</span> ${rowCount ?? data.length} row${(rowCount ?? data.length) !== 1 ? 's' : ''} returned`;
    },

    // ══════════════════════════════════════
    //  STRUCTURED REASONING (Explainable AI)
    // ══════════════════════════════════════
    renderStructuredReasoning(data) {
        const container = this.el.reasoningContainer;
        if (!container) return;

        const reasoning = data.reasoning;

        // If no structured reasoning, fall back to old explanation
        if (!reasoning || !reasoning.intent) {
            container.innerHTML = this._renderLegacyExplanation(data);
            return;
        }

        let html = '';

        // ── Intent ──
        html += `
            <div class="reasoning-section reasoning-intent">
                <div class="reasoning-section-header">
                    <span class="reasoning-icon">🎯</span>
                    <span class="reasoning-label">Intent</span>
                </div>
                <div class="reasoning-content intent-text">${this.escapeHtml(reasoning.intent)}</div>
            </div>
        `;

        // ── Tables Used ──
        if (reasoning.tables_used && reasoning.tables_used.length > 0) {
            html += `
                <div class="reasoning-section">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">🗄️</span>
                        <span class="reasoning-label">Tables Used</span>
                    </div>
                    <div class="reasoning-items">
                        ${reasoning.tables_used.map(t => `
                            <div class="reasoning-item">
                                <span class="reasoning-item-name">${this.escapeHtml(t.name)}</span>
                                <span class="reasoning-item-reason">${this.escapeHtml(t.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // ── Columns Selected ──
        if (reasoning.columns_selected && reasoning.columns_selected.length > 0) {
            html += `
                <div class="reasoning-section">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">📋</span>
                        <span class="reasoning-label">Columns Selected</span>
                    </div>
                    <div class="reasoning-items">
                        ${reasoning.columns_selected.map(c => `
                            <div class="reasoning-item">
                                <code class="reasoning-item-code">${this.escapeHtml(c.name)}</code>
                                <span class="reasoning-item-reason">${this.escapeHtml(c.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // ── Joins ──
        if (reasoning.joins && reasoning.joins.length > 0) {
            html += `
                <div class="reasoning-section">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">🔗</span>
                        <span class="reasoning-label">Joins</span>
                    </div>
                    <div class="reasoning-items">
                        ${reasoning.joins.map(j => `
                            <div class="reasoning-item reasoning-item-join">
                                <div class="join-header">
                                    <span class="join-type-badge">${this.escapeHtml(j.type)}</span>
                                    <span class="join-tables">${this.escapeHtml(j.tables)}</span>
                                </div>
                                <code class="join-condition">${this.escapeHtml(j.condition)}</code>
                                <span class="reasoning-item-reason">${this.escapeHtml(j.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // ── Filters ──
        if (reasoning.filters && reasoning.filters.length > 0) {
            html += `
                <div class="reasoning-section">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">🔍</span>
                        <span class="reasoning-label">Filters (WHERE)</span>
                    </div>
                    <div class="reasoning-items">
                        ${reasoning.filters.map(f => `
                            <div class="reasoning-item">
                                <code class="reasoning-item-code">${this.escapeHtml(f.condition)}</code>
                                <span class="reasoning-item-reason">${this.escapeHtml(f.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // ── Aggregations ──
        if (reasoning.aggregations && reasoning.aggregations.length > 0) {
            html += `
                <div class="reasoning-section">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">📊</span>
                        <span class="reasoning-label">Aggregations</span>
                    </div>
                    <div class="reasoning-items">
                        ${reasoning.aggregations.map(a => `
                            <div class="reasoning-item">
                                <code class="reasoning-item-code">${this.escapeHtml(a.function)}(${this.escapeHtml(a.column)})${a.alias ? ' → ' + this.escapeHtml(a.alias) : ''}</code>
                                <span class="reasoning-item-reason">${this.escapeHtml(a.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // ── Sorting ──
        if (reasoning.sorting && reasoning.sorting.length > 0) {
            html += `
                <div class="reasoning-section">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">↕️</span>
                        <span class="reasoning-label">Sorting</span>
                    </div>
                    <div class="reasoning-items">
                        ${reasoning.sorting.map(s => `
                            <div class="reasoning-item">
                                <code class="reasoning-item-code">${this.escapeHtml(s.column)} ${s.direction === 'DESC' ? '↓' : '↑'} ${this.escapeHtml(s.direction)}</code>
                                <span class="reasoning-item-reason">${this.escapeHtml(s.reason)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // ── Assumptions ──
        if (reasoning.assumptions && reasoning.assumptions.length > 0) {
            html += `
                <div class="reasoning-section reasoning-assumptions">
                    <div class="reasoning-section-header">
                        <span class="reasoning-icon">💡</span>
                        <span class="reasoning-label">Assumptions</span>
                    </div>
                    <ul class="reasoning-assumptions-list">
                        ${reasoning.assumptions.map(a => `<li>${this.escapeHtml(a)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // ── Query Type Badge ──
        if (data.query_type) {
            html += `
                <div class="query-type-indicator">
                    <span class="query-type-label">Query Type</span>
                    <span class="query-type-badge qt-${data.query_type.replace('+', '-')}">${this.escapeHtml(data.query_type)}</span>
                </div>
            `;
        }

        container.innerHTML = html;
    },

    _renderLegacyExplanation(data) {
        // Fallback for when no structured reasoning is available
        let html = '';
        const explanation = data.explanation;
        const tablesUsed = data.tables_used;
        const assumptions = data.assumptions;

        if (tablesUsed && tablesUsed.length > 0) {
            html += `
                <div class="tables-used-label">Tables Referenced</div>
                <div class="tables-used-chips">
                    ${tablesUsed.map(t => `<span class="table-chip">📋 ${this.escapeHtml(t)}</span>`).join('')}
                </div>
            `;
        }

        if (explanation) {
            html += `
                <div class="explanation-label"><span>💡</span> Reasoning</div>
                <div class="explanation-text">${this.formatExplanation(explanation)}</div>
            `;
        }

        if (assumptions && assumptions.length > 0) {
            html += `
                <ul class="assumptions-list">
                    ${assumptions.map(a => `<li>${this.escapeHtml(a)}</li>`).join('')}
                </ul>
            `;
        }

        return html || '<p style="color: var(--text-tertiary);">No explanation available.</p>';
    },

    formatExplanation(text) {
        return this.escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:1px 4px;border-radius:3px;font-family:var(--font-mono);font-size:0.85em;">$1</code>');
    },

    // ── Corrections Tab (Enhanced) ──
    renderCorrections(data) {
        const count = data.corrections || 0;

        // Always show the tab
        this.el.tabCorrections.classList.remove('hidden');

        // Update badge
        if (this.el.correctionBadge) {
            this.el.correctionBadge.textContent = count;
            this.el.correctionBadge.className = `correction-badge ${count > 0 ? 'has-corrections' : ''}`;
        }

        if (count === 0) {
            this.el.correctionSteps.innerHTML = `
                <div class="no-corrections">
                    <span class="no-corrections-icon">✅</span>
                    <div class="no-corrections-text">No corrections needed</div>
                    <div class="no-corrections-sub">SQL executed successfully on the first attempt</div>
                </div>
            `;
            if (this.el.correctionDiff) {
                this.el.correctionDiff.innerHTML = '';
            }
            return;
        }

        // Render correction timeline
        if (data.correction_history && data.correction_history.length > 0) {
            let html = `
                <div class="correction-summary">
                    <span class="correction-summary-icon">🔄</span>
                    <span>Self-correction completed in <strong>${count}</strong> attempt${count > 1 ? 's' : ''}</span>
                    <span class="correction-summary-status ${data.success ? 'status-success' : 'status-failed'}">${data.success ? '✅ Resolved' : '❌ Unresolved'}</span>
                </div>
            `;

            data.correction_history.forEach((step, i) => {
                html += `
                    <div class="correction-step">
                        <div class="correction-step-marker">
                            <span class="correction-step-num">${step.attempt}</span>
                        </div>
                        <div class="correction-step-content">
                            <div class="correction-step-label">Attempt ${step.attempt}</div>
                            <pre class="correction-step-sql">${this.escapeHtml(step.sql)}</pre>
                            <div class="correction-step-error">
                                <span class="error-icon">❌</span>
                                ${this.escapeHtml(step.error)}
                            </div>
                        </div>
                    </div>
                `;
            });

            // Add final success step
            if (data.success && data.sql) {
                html += `
                    <div class="correction-step correction-step-final">
                        <div class="correction-step-marker success">
                            <span class="correction-step-num">✓</span>
                        </div>
                        <div class="correction-step-content">
                            <div class="correction-step-label" style="color: var(--success);">Final SQL (Success)</div>
                            <pre class="correction-step-sql correction-step-sql-success">${this.escapeHtml(data.sql)}</pre>
                        </div>
                    </div>
                `;
            }

            this.el.correctionSteps.innerHTML = html;
        }

        // Render SQL diff view (original vs corrected)
        if (this.el.correctionDiff && data.original_sql && data.sql && data.original_sql !== data.sql) {
            const diffView = QueryDiff.createDiffView(data.original_sql, data.sql);
            this.el.correctionDiff.innerHTML = '';
            this.el.correctionDiff.appendChild(diffView);
        } else if (this.el.correctionDiff) {
            this.el.correctionDiff.innerHTML = '';
        }
    },

    // ── Result Stats ──
    renderResultStats(data) {
        let stats = '';

        if (data.execution_time_ms != null) {
            stats += `<div class="stat-item"><span>⏱</span> <span class="stat-value">${data.execution_time_ms}ms</span></div>`;
        }
        if (data.ambiguity_score != null) {
            const pct = Math.round(data.ambiguity_score * 100);
            const color = pct >= 80 ? 'var(--success)' : pct >= 60 ? 'var(--warning)' : 'var(--error)';
            stats += `<div class="stat-item"><span>🎯</span> Clarity: <span class="stat-value" style="color:${color}">${pct}%</span></div>`;
        }
        if (data.corrections > 0) {
            stats += `<div class="stat-item"><span>🔄</span> Corrections: <span class="stat-value" style="color:var(--warning)">${data.corrections}</span></div>`;
        }
        if (data.query_type) {
            stats += `<div class="stat-item"><span>📦</span> Type: <span class="stat-value">${data.query_type}</span></div>`;
        }
        if (data.drift_detected) {
            stats += `<div class="stat-item" style="color:var(--warning)"><span>⚠️</span> Schema drift detected</div>`;
        }

        this.el.resultStats.innerHTML = stats;
    },

    // ── Schema Panel ──
    renderSchemaPanel(tables) {
        if (!tables || tables.length === 0) {
            this.el.schemaPanel.innerHTML = '<p style="color: var(--text-tertiary); font-size: var(--text-sm);">No tables found.</p>';
            return;
        }

        let html = '';
        tables.forEach((table, idx) => {
            html += `
                <div class="schema-table" id="schema-table-${table.name}">
                    <div class="schema-table-header" data-table="${table.name}" onclick="UI.toggleTable('${table.name}')">
                        <span class="schema-table-name">
                            <span class="table-icon">📋</span>
                            ${this.escapeHtml(table.name)}
                        </span>
                        <div style="display:flex;align-items:center;gap:var(--space-2);">
                            ${table.row_count != null ? `<span class="schema-row-count">${table.row_count} rows</span>` : ''}
                            <span class="schema-table-chevron">▼</span>
                        </div>
                    </div>
                    <div class="schema-columns" id="cols-${table.name}">
                        ${table.columns.map(col => `
                            <div class="schema-column">
                                <span class="schema-col-name">${this.escapeHtml(col.name)}</span>
                                <span class="schema-col-type">${this.escapeHtml(col.type)}</span>
                                ${col.primary_key ? '<span class="schema-col-badge badge-pk">PK</span>' : ''}
                                ${col.foreign_key ? `<span class="schema-col-badge badge-fk" title="→ ${this.escapeHtml(col.foreign_key)}">FK</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        this.el.schemaPanel.innerHTML = html;
    },

    toggleTable(tableName) {
        const header = document.querySelector(`[data-table="${tableName}"]`);
        const columns = document.getElementById(`cols-${tableName}`);
        if (header && columns) {
            header.classList.toggle('open');
            columns.classList.toggle('open');
        }
    },

    // ── History Panel ──
    renderHistory(history) {
        const panel = this.el.historyPanel;
        const emptyState = this.el.historyEmpty;

        if (!history || history.length === 0) {
            emptyState.classList.remove('hidden');
            const items = panel.querySelectorAll('.history-item');
            items.forEach(item => item.remove());
            return;
        }

        emptyState.classList.add('hidden');

        let html = '';
        history.forEach(entry => {
            html += `
                <div class="history-item" data-query="${this.escapeHtml(entry.query)}" style="cursor:pointer;" title="Click to rerun">
                    <div class="history-status ${entry.success ? 'success' : 'error'}"></div>
                    <div style="flex:1;">
                        <div class="history-text">${this.escapeHtml(entry.query)}</div>
                        <div class="history-meta">
                            ${this.formatTime(entry.timestamp)}
                            ${entry.corrections > 0 ? ` · ${entry.corrections} fix${entry.corrections > 1 ? 'es' : ''}` : ''}
                            ${entry.query_type ? ` · ${entry.query_type}` : ''}
                        </div>
                    </div>
                </div>
            `;
        });

        const items = panel.querySelectorAll('.history-item');
        items.forEach(item => item.remove());
        panel.insertAdjacentHTML('afterbegin', html);

        // Event delegation for history items (replaces inline onclick)
        panel.querySelectorAll('.history-item[data-query]').forEach(item => {
            item.addEventListener('click', () => {
                const q = item.getAttribute('data-query');
                if (q) app.rerunQuery(q);
            });
        });
    },

    formatTime(isoString) {
        try {
            const hasTz = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString);
            const date = new Date(hasTz ? isoString : isoString + 'Z');
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    },

    // ── Drift Alert ──
    showDriftAlert(changes) {
        this.el.driftAlert.classList.add('visible');
        this.el.driftChangesList.innerHTML = changes.map(c => `<li>${this.escapeHtml(c)}</li>`).join('');
        
        this.el.badgeDrift.classList.add('drifted');
        this.el.driftStatus.textContent = 'Drift Detected';
    },

    hideDriftAlert() {
        this.el.driftAlert.classList.remove('visible');
        this.el.badgeDrift.classList.remove('drifted');
        this.el.driftStatus.textContent = 'Schema OK';
    },

    // ── Clarification Modal ──
    showClarificationModal(question, ambiguities) {
        this.hideLoading();
        this.el.modalQuestion.textContent = question || 'Your query has some ambiguity. Could you provide more detail?';

        this.el.modalAmbiguities.innerHTML = ambiguities
            .map(a => `<li>${this.escapeHtml(a)}</li>`)
            .join('');

        this.el.modalInput.value = '';
        this.el.modalOverlay.classList.add('visible');
        
        setTimeout(() => this.el.modalInput.focus(), 400);
    },

    hideClarificationModal() {
        this.el.modalOverlay.classList.remove('visible');
    },

    // ── Tab Switching ──
    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => {
            const isActive = btn.dataset.tab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive.toString());
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        const tabMap = {
            'data': 'tab-data',
            'sql': 'tab-sql',
            'explanation': 'tab-explanation',
            'corrections': 'tab-corrections-content',
        };

        const target = document.getElementById(tabMap[tabName]);
        if (target) {
            target.classList.add('active');
        }
    },

    // ── Copy SQL ──
    async copySql() {
        const sqlText = this.el.sqlCode.textContent;
        try {
            await navigator.clipboard.writeText(sqlText);
            this.el.btnCopySql.textContent = '✓ Copied!';
            this.el.btnCopySql.classList.add('copied');
            setTimeout(() => {
                this.el.btnCopySql.textContent = 'Copy';
                this.el.btnCopySql.classList.remove('copied');
            }, 2000);
        } catch {
            // Fallback: show the text for manual copy
            this.el.btnCopySql.textContent = '⚠ Use Ctrl+C';
            setTimeout(() => { this.el.btnCopySql.textContent = 'Copy'; }, 3000);
        }
    },

    // ── LLM Mode Selector ──
    updateModeDisplay(providerName, providerId) {
        // Update the select dropdown to match the current provider
        const selectEl = document.getElementById('llm-mode-select');
        if (selectEl && providerId) {
            selectEl.value = providerId;
        }
    },
};
