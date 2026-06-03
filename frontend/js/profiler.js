/**
 * QuerySense — Query Performance Profiler
 * Interactive visualization of EXPLAIN QUERY PLAN output.
 * Renders an animated tree with severity badges, performance scoring,
 * optimization hints, and deep database internals metadata.
 */

const QueryProfiler = {

    /**
     * Render the full profiler panel into the given container.
     * @param {string} containerId - DOM element ID to render into
     * @param {object} profileData - Rich profiler data from backend
     * @param {string} sql - The SQL query being profiled
     */
    render(containerId, profileData, sql) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (!profileData || !profileData.plan_steps || profileData.plan_steps.length === 0) {
            container.innerHTML = `
                <div class="profiler-empty">
                    <div class="profiler-empty-icon">📊</div>
                    <div class="profiler-empty-text">No query plan available</div>
                    <div class="profiler-empty-sub">Run a query to see its execution profile</div>
                </div>
            `;
            return;
        }

        let html = '';

        // ── Performance Score Gauge ──
        html += this._renderScoreGauge(profileData.performance_score);

        // ── Summary Stats Bar ──
        html += this._renderSummaryStats(profileData);

        // ── Query Plan Tree ──
        html += this._renderPlanTree(profileData.plan_steps);

        // ── Table Statistics ──
        if (profileData.summary && profileData.summary.table_row_counts) {
            html += this._renderTableStats(profileData.summary);
        }

        // ── Optimization Suggestions ──
        if (profileData.suggestions && profileData.suggestions.length > 0) {
            html += this._renderSuggestions(profileData.suggestions);
        }

        // ── Bytecode Info ──
        if (profileData.bytecode_count > 0) {
            html += this._renderBytecodeInfo(profileData.bytecode_count);
        }

        container.innerHTML = html;

        // Animate score gauge after render
        requestAnimationFrame(() => {
            this._animateScoreGauge(profileData.performance_score);
        });
    },

    // ══════════════════════════════════════
    //  Performance Score Gauge
    // ══════════════════════════════════════
    _renderScoreGauge(score) {
        const grade = this._getGrade(score);
        const color = this._getScoreColor(score);

        return `
            <div class="profiler-score-section">
                <div class="profiler-score-gauge" id="profiler-gauge">
                    <svg viewBox="0 0 120 120" class="profiler-gauge-svg">
                        <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(99, 102, 241, 0.1)" stroke-width="8" />
                        <circle cx="60" cy="60" r="52" fill="none" 
                            stroke="${color}" stroke-width="8"
                            stroke-dasharray="326.73" 
                            stroke-dashoffset="326.73"
                            stroke-linecap="round"
                            transform="rotate(-90 60 60)"
                            class="profiler-gauge-fill"
                            id="gauge-fill" />
                    </svg>
                    <div class="profiler-score-value">
                        <span class="profiler-score-number" id="gauge-number" style="color: ${color}">0</span>
                        <span class="profiler-score-label">Performance</span>
                    </div>
                </div>
                <div class="profiler-grade">
                    <span class="profiler-grade-badge" style="background: ${color}20; color: ${color}; border-color: ${color}40">${grade.label}</span>
                    <span class="profiler-grade-desc">${grade.description}</span>
                </div>
            </div>
        `;
    },

    _animateScoreGauge(score) {
        const fill = document.getElementById('gauge-fill');
        const number = document.getElementById('gauge-number');
        if (!fill || !number) return;

        const circumference = 2 * Math.PI * 52; // 326.73
        const offset = circumference - (score / 100) * circumference;

        // Animate the stroke
        setTimeout(() => {
            fill.style.transition = 'stroke-dashoffset 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
            fill.style.strokeDashoffset = offset;
        }, 100);

        // Animate the number
        let current = 0;
        const duration = 1200;
        const step = score / (duration / 16);
        const timer = setInterval(() => {
            current += step;
            if (current >= score) {
                current = score;
                clearInterval(timer);
            }
            number.textContent = Math.round(current);
        }, 16);
    },

    // ══════════════════════════════════════
    //  Summary Stats
    // ══════════════════════════════════════
    _renderSummaryStats(data) {
        const summary = data.summary || {};

        const stats = [
            { icon: '📋', label: 'Operations', value: summary.total_operations || 0 },
            { icon: '🔴', label: 'Full Scans', value: summary.full_scans || 0, warn: (summary.full_scans || 0) > 0 },
            { icon: '🟢', label: 'Index Lookups', value: summary.index_lookups || 0 },
            { icon: '🟡', label: 'Index Scans', value: summary.index_scans || 0 },
            { icon: '🟠', label: 'Temp Sorts', value: summary.temp_trees || 0, warn: (summary.temp_trees || 0) > 0 },
            { icon: '⚙️', label: 'VDBE Ops', value: data.bytecode_count || 0 },
        ];

        return `
            <div class="profiler-stats-grid">
                ${stats.map(s => `
                    <div class="profiler-stat ${s.warn ? 'profiler-stat-warn' : ''}">
                        <span class="profiler-stat-icon">${s.icon}</span>
                        <span class="profiler-stat-value">${s.value}</span>
                        <span class="profiler-stat-label">${s.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    },

    // ══════════════════════════════════════
    //  Query Plan Tree
    // ══════════════════════════════════════
    _renderPlanTree(steps) {
        // Build tree structure from flat list using id/parent
        const tree = this._buildTree(steps);

        return `
            <div class="profiler-tree-section">
                <div class="profiler-section-header">
                    <span class="profiler-section-icon">🌳</span>
                    <span class="profiler-section-title">Execution Plan Tree</span>
                    <span class="profiler-section-subtitle">EXPLAIN QUERY PLAN</span>
                </div>
                <div class="profiler-tree">
                    ${this._renderTreeNodes(tree, 0)}
                </div>
            </div>
        `;
    },

    _buildTree(steps) {
        // If all have parent=0, treat as flat list
        const nodeMap = new Map();
        const roots = [];

        steps.forEach((step, idx) => {
            const node = { ...step, children: [], _idx: idx };
            nodeMap.set(step.id, node);
        });

        steps.forEach((step, idx) => {
            const node = nodeMap.get(step.id);
            const parent = nodeMap.get(step.parent);
            if (parent && step.id !== step.parent) {
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        });

        return roots;
    },

    _renderTreeNodes(nodes, depth) {
        if (!nodes || nodes.length === 0) return '';

        return nodes.map((node, idx) => {
            const hasChildren = node.children && node.children.length > 0;
            const isLast = idx === nodes.length - 1;
            const severityClass = `profiler-node-${node.severity || 'info'}`;
            const costClass = `profiler-cost-${(node.cost_label || 'LOW').toLowerCase()}`;
            const animDelay = (node._idx || 0) * 80;

            return `
                <div class="profiler-node ${severityClass}" 
                     style="--depth: ${depth}; animation-delay: ${animDelay}ms"
                     data-type="${node.type || 'other'}">
                    <div class="profiler-node-connector">
                        <div class="profiler-node-line ${isLast ? 'last' : ''}"></div>
                        <div class="profiler-node-dot ${severityClass}"></div>
                    </div>
                    <div class="profiler-node-content" ${hasChildren ? `onclick="QueryProfiler.toggleNode(this)"` : ''}>
                        <div class="profiler-node-header">
                            <span class="profiler-node-icon">${node.icon || '⚪'}</span>
                            <span class="profiler-node-detail">${this._escapeHtml(node.detail)}</span>
                            <span class="profiler-cost-badge ${costClass}">${node.cost_label || 'LOW'}</span>
                            ${hasChildren ? '<span class="profiler-node-toggle">▼</span>' : ''}
                        </div>
                        ${node.hint ? `<div class="profiler-node-hint">${this._escapeHtml(node.hint)}</div>` : ''}
                    </div>
                </div>
                ${hasChildren ? `
                    <div class="profiler-node-children" style="--depth: ${depth + 1}">
                        ${this._renderTreeNodes(node.children, depth + 1)}
                    </div>
                ` : ''}
            `;
        }).join('');
    },

    toggleNode(el) {
        const parent = el.closest('.profiler-node');
        if (!parent) return;
        const children = parent.nextElementSibling;
        if (children && children.classList.contains('profiler-node-children')) {
            children.classList.toggle('collapsed');
            const toggle = el.querySelector('.profiler-node-toggle');
            if (toggle) {
                toggle.textContent = children.classList.contains('collapsed') ? '▶' : '▼';
            }
        }
    },

    // ══════════════════════════════════════
    //  Table Statistics
    // ══════════════════════════════════════
    _renderTableStats(summary) {
        const rowCounts = summary.table_row_counts || {};
        const tables = summary.tables_accessed || [];
        const indexes = summary.indexes_used || [];

        if (tables.length === 0) return '';

        return `
            <div class="profiler-tables-section">
                <div class="profiler-section-header">
                    <span class="profiler-section-icon">🗄️</span>
                    <span class="profiler-section-title">Tables & Indexes</span>
                </div>
                <div class="profiler-tables-grid">
                    ${tables.map(tbl => {
                        const count = rowCounts[tbl];
                        const sizeLabel = count > 10000 ? 'Large' : count > 1000 ? 'Medium' : 'Small';
                        const sizeClass = count > 10000 ? 'large' : count > 1000 ? 'medium' : 'small';
                        return `
                            <div class="profiler-table-card">
                                <div class="profiler-table-name">
                                    <span class="profiler-table-icon">📋</span>
                                    ${this._escapeHtml(tbl)}
                                </div>
                                <div class="profiler-table-meta">
                                    <span class="profiler-table-rows">${count >= 0 ? count.toLocaleString() + ' rows' : 'N/A'}</span>
                                    <span class="profiler-table-size profiler-size-${sizeClass}">${sizeLabel}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${indexes.length > 0 ? `
                    <div class="profiler-indexes">
                        <div class="profiler-indexes-label">Indexes Used:</div>
                        <div class="profiler-indexes-list">
                            ${indexes.map(idx => `
                                <span class="profiler-index-chip">🔑 ${this._escapeHtml(idx)}</span>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="profiler-indexes">
                        <div class="profiler-indexes-label" style="color: var(--warning)">⚠️ No indexes used in this query</div>
                    </div>
                `}
            </div>
        `;
    },

    // ══════════════════════════════════════
    //  Optimization Suggestions
    // ══════════════════════════════════════
    _renderSuggestions(suggestions) {
        return `
            <div class="profiler-suggestions-section">
                <div class="profiler-section-header">
                    <span class="profiler-section-icon">💡</span>
                    <span class="profiler-section-title">Optimization Insights</span>
                </div>
                <div class="profiler-suggestions-list">
                    ${suggestions.map(s => {
                        const iconMap = { warning: '⚠️', info: 'ℹ️', good: '✅' };
                        const classMap = { warning: 'warning', info: 'info', good: 'good' };
                        return `
                            <div class="profiler-suggestion profiler-suggestion-${classMap[s.severity] || 'info'}">
                                <div class="profiler-suggestion-header">
                                    <span class="profiler-suggestion-icon">${iconMap[s.severity] || 'ℹ️'}</span>
                                    <span class="profiler-suggestion-title">${this._escapeHtml(s.title)}</span>
                                </div>
                                <div class="profiler-suggestion-desc">${this._escapeHtml(s.description)}</div>
                                ${s.sql_suggestion ? `
                                    <pre class="profiler-suggestion-sql">${this._escapeHtml(s.sql_suggestion)}</pre>
                                ` : ''}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    },

    // ══════════════════════════════════════
    //  Bytecode Info
    // ══════════════════════════════════════
    _renderBytecodeInfo(count) {
        const complexity = count > 100 ? 'High' : count > 40 ? 'Medium' : 'Low';
        const complexityClass = count > 100 ? 'high' : count > 40 ? 'medium' : 'low';

        return `
            <div class="profiler-bytecode-section">
                <div class="profiler-section-header">
                    <span class="profiler-section-icon">⚙️</span>
                    <span class="profiler-section-title">SQLite Virtual Machine</span>
                </div>
                <div class="profiler-bytecode-content">
                    <div class="profiler-bytecode-stat">
                        <span class="profiler-bytecode-number">${count}</span>
                        <span class="profiler-bytecode-label">VDBE Bytecode Instructions</span>
                    </div>
                    <div class="profiler-bytecode-complexity profiler-complexity-${complexityClass}">
                        Complexity: <strong>${complexity}</strong>
                    </div>
                    <div class="profiler-bytecode-explainer">
                        SQLite compiles SQL into a bytecode program executed by the VDBE (Virtual Database Engine). 
                        Fewer instructions generally means faster execution.
                    </div>
                </div>
            </div>
        `;
    },

    // ══════════════════════════════════════
    //  Utility Helpers
    // ══════════════════════════════════════
    _getScoreColor(score) {
        if (score >= 80) return '#10b981';  // green
        if (score >= 60) return '#f59e0b';  // amber
        if (score >= 40) return '#f97316';  // orange
        return '#ef4444';                    // red
    },

    _getGrade(score) {
        if (score >= 90) return { label: 'A+', description: 'Excellent — fully optimized query path' };
        if (score >= 80) return { label: 'A', description: 'Great — minor optimizations possible' };
        if (score >= 70) return { label: 'B', description: 'Good — some optimization opportunities' };
        if (score >= 60) return { label: 'C', description: 'Fair — noticeable performance overhead' };
        if (score >= 40) return { label: 'D', description: 'Poor — significant optimization needed' };
        return { label: 'F', description: 'Critical — major performance issues detected' };
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};
