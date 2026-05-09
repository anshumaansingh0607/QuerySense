/**
 * QuerySense — Analytics Dashboard
 * Renders real-time query performance metrics using Canvas API.
 * All data comes from the /api/analytics endpoint — nothing is faked.
 */

const Analytics = {
    // Local cache for quick UI updates between API calls
    localData: {
        executionTimes: [],
    },

    updateFromResult(result) {
        if (result.execution_time_ms != null) {
            this.localData.executionTimes.push(result.execution_time_ms);
            if (this.localData.executionTimes.length > 50) {
                this.localData.executionTimes.shift();
            }
        }
    },

    updateFromHistory() {
        // No-op — analytics now come from the /api/analytics endpoint
    },

    async render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        // Show loading
        container.innerHTML = `
            <div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">
                <div class="loading-spinner" style="margin:0 auto var(--space-4);"></div>
                Loading analytics...
            </div>
        `;

        // Fetch real analytics from the backend
        let data;
        try {
            data = await api.getAnalytics();
        } catch (e) {
            container.innerHTML = `<div style="text-align:center;padding:var(--space-8);color:var(--text-tertiary);">Failed to load analytics: ${e.message}</div>`;
            return;
        }

        // Use local execution times if API doesn't have enough
        const execTimes = data.execution_times && data.execution_times.length > 0
            ? data.execution_times
            : this.localData.executionTimes;

        // Intelligence Score color
        const scoreColor = data.intelligence_score >= 80
            ? 'var(--success)'
            : data.intelligence_score >= 60
                ? 'var(--warning)'
                : 'var(--error)';

        container.innerHTML = `
            <div class="analytics-grid">
                <!-- Intelligence Score (Hero) -->
                <div class="analytics-hero">
                    <div class="intelligence-score-card">
                        <div class="intelligence-label">
                            <span>🧠</span> System Intelligence Score
                            <span class="analytics-tooltip" data-tooltip="Computed from: 60% success rate + 25% self-healing ability + 15% speed efficiency">ⓘ</span>
                        </div>
                        <div class="intelligence-value" style="color:${scoreColor}">${data.intelligence_score}%</div>
                        <div class="intelligence-bar">
                            <div class="intelligence-bar-fill" style="width:${data.intelligence_score}%;background:${scoreColor}"></div>
                        </div>
                    </div>
                </div>

                <!-- Stat Cards -->
                <div class="analytics-stats">
                    <div class="analytics-stat-card">
                        <div class="analytics-stat-value">${data.total_queries}</div>
                        <div class="analytics-stat-label">
                            Total Queries
                            <span class="analytics-tooltip" data-tooltip="Total number of queries processed by the system">ⓘ</span>
                        </div>
                        <div class="analytics-stat-icon">📊</div>
                    </div>
                    <div class="analytics-stat-card">
                        <div class="analytics-stat-value" style="color: var(--success)">${data.success_rate}%</div>
                        <div class="analytics-stat-label">
                            Success Rate
                            <span class="analytics-tooltip" data-tooltip="Percentage of queries that returned valid results">ⓘ</span>
                        </div>
                        <div class="analytics-stat-icon">✅</div>
                    </div>
                    <div class="analytics-stat-card">
                        <div class="analytics-stat-value">${data.avg_execution_time}ms</div>
                        <div class="analytics-stat-label">
                            Avg Exec Time
                            <span class="analytics-tooltip" data-tooltip="Average time from query submission to result return">ⓘ</span>
                        </div>
                        <div class="analytics-stat-icon">⚡</div>
                    </div>
                    <div class="analytics-stat-card">
                        <div class="analytics-stat-value" style="color: var(--warning)">${data.correction_rate}%</div>
                        <div class="analytics-stat-label">
                            Correction Rate
                            <span class="analytics-tooltip" data-tooltip="Percentage of queries that needed self-correction">ⓘ</span>
                        </div>
                        <div class="analytics-stat-icon">🔄</div>
                    </div>
                    <div class="analytics-stat-card">
                        <div class="analytics-stat-value">${data.avg_corrections_per_query}</div>
                        <div class="analytics-stat-label">
                            Avg Corrections
                            <span class="analytics-tooltip" data-tooltip="Average number of self-correction attempts per query">ⓘ</span>
                        </div>
                        <div class="analytics-stat-icon">🔧</div>
                    </div>
                    <div class="analytics-stat-card">
                        <div class="analytics-stat-value">${data.most_common_query_type || '—'}</div>
                        <div class="analytics-stat-label">
                            Most Common Type
                            <span class="analytics-tooltip" data-tooltip="Most frequently used query pattern (simple/filter/join/aggregation)">ⓘ</span>
                        </div>
                        <div class="analytics-stat-icon">📦</div>
                    </div>
                </div>

                <!-- Charts Row -->
                <div class="analytics-charts">
                    <div class="analytics-chart-card">
                        <div class="analytics-chart-title">Success vs. Failure</div>
                        <canvas id="chart-success" width="240" height="180"></canvas>
                    </div>
                    <div class="analytics-chart-card">
                        <div class="analytics-chart-title">Correction Distribution</div>
                        <canvas id="chart-corrections" width="240" height="180"></canvas>
                    </div>
                    <div class="analytics-chart-card">
                        <div class="analytics-chart-title">Execution Times (ms)</div>
                        <canvas id="chart-exec-time" width="240" height="180"></canvas>
                    </div>
                </div>

                <!-- Query Type Breakdown -->
                <div class="analytics-charts" style="margin-top: var(--space-4);">
                    <div class="analytics-chart-card">
                        <div class="analytics-chart-title">Query Type Breakdown</div>
                        <canvas id="chart-query-types" width="240" height="180"></canvas>
                    </div>
                    <div class="analytics-chart-card">
                        <div class="analytics-chart-title">Most Used Tables</div>
                        <canvas id="chart-tables" width="240" height="180"></canvas>
                    </div>
                    <div class="analytics-chart-card analytics-list-card">
                        <div class="analytics-chart-title">Recent Corrections</div>
                        <div class="analytics-list" id="analytics-corrections-list">
                            ${this._renderCorrectionsList(data.queries_with_corrections)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Render charts after DOM update
        requestAnimationFrame(() => {
            const successFail = {
                success: Math.round(data.success_rate * data.total_queries / 100),
                fail: data.total_queries - Math.round(data.success_rate * data.total_queries / 100),
            };
            this.drawDonutChart('chart-success', successFail);
            this.drawBarChart('chart-corrections', data.correction_distribution);
            this.drawLineChart('chart-exec-time', execTimes);
            this.drawBarChart('chart-query-types', data.query_type_breakdown, ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#e0e7ff']);
            this.drawHorizontalBarChart('chart-tables', data.most_used_tables);
        });
    },

    _renderCorrectionsList(corrections) {
        if (!corrections || corrections.length === 0) {
            return '<div style="padding:var(--space-4);color:var(--text-tertiary);font-size:var(--text-xs);text-align:center;">No corrections yet</div>';
        }
        return corrections.map(c => `
            <div class="analytics-list-item">
                <div class="analytics-list-query">${this._escapeHtml(c.query)}</div>
                <div class="analytics-list-meta">
                    <span class="${c.success ? 'analytics-tag-success' : 'analytics-tag-fail'}">${c.success ? '✅' : '❌'}</span>
                    <span>${c.corrections} fix${c.corrections > 1 ? 'es' : ''}</span>
                </div>
            </div>
        `).join('');
    },

    // ── Donut Chart ──
    drawDonutChart(canvasId, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const cx = w / 2;
        const cy = h / 2 - 5;
        const radius = Math.min(cx, cy) - 20;
        const innerRadius = radius * 0.6;
        const total = data.success + data.fail;

        if (total === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data yet', cx, cy);
            return;
        }

        const segments = [
            { value: data.success, color: '#10b981', label: 'Success' },
            { value: data.fail, color: '#ef4444', label: 'Failed' },
        ];

        let startAngle = -Math.PI / 2;

        segments.forEach(seg => {
            const sliceAngle = (seg.value / total) * Math.PI * 2;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
            ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = seg.color;
            ctx.fill();
            startAngle += sliceAngle;
        });

        // Center text
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 22px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${Math.round((data.success / total) * 100)}%`, cx, cy + 4);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('success', cx, cy + 18);

        // Legend
        const legendY = h - 14;
        segments.forEach((seg, i) => {
            const lx = cx - 50 + i * 90;
            ctx.fillStyle = seg.color;
            ctx.fillRect(lx, legendY - 4, 8, 8);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`${seg.label}: ${seg.value}`, lx + 12, legendY + 3);
        });
    },

    // ── Bar Chart ──
    drawBarChart(canvasId, data, customColors) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const padding = { top: 10, right: 15, bottom: 30, left: 15 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const labels = Object.keys(data);
        const values = Object.values(data).map(Number);
        
        if (labels.length === 0 || values.every(v => v === 0)) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data yet', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...values, 1);
        const defaultColors = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];
        const barColors = customColors || defaultColors;

        const barWidth = chartW / labels.length * 0.6;
        const gap = chartW / labels.length;

        values.forEach((val, i) => {
            const barHeight = (val / maxVal) * chartH;
            const x = padding.left + i * gap + (gap - barWidth) / 2;
            const y = padding.top + chartH - barHeight;

            const r = 4;
            ctx.beginPath();
            ctx.moveTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.lineTo(x + barWidth - r, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
            ctx.lineTo(x + barWidth, padding.top + chartH);
            ctx.lineTo(x, padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = barColors[i % barColors.length];
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.globalAlpha = 1;

            if (val > 0) {
                ctx.fillStyle = '#f1f5f9';
                ctx.font = 'bold 12px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(val, x + barWidth / 2, y - 5);
            }

            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            // Truncate long labels
            const label = labels[i].length > 10 ? labels[i].substring(0, 9) + '…' : labels[i];
            ctx.fillText(label, x + barWidth / 2, padding.top + chartH + 16);
        });
    },

    // ── Horizontal Bar Chart (for table usage) ──
    drawHorizontalBarChart(canvasId, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;

        const labels = Object.keys(data);
        const values = Object.values(data).map(Number);

        if (labels.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No data yet', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...values, 1);
        const padding = { top: 10, right: 15, bottom: 10, left: 90 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const barHeight = Math.min(chartH / labels.length * 0.7, 20);
        const gap = chartH / labels.length;
        const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'];

        labels.forEach((label, i) => {
            const barW = (values[i] / maxVal) * chartW;
            const y = padding.top + i * gap + (gap - barHeight) / 2;

            // Bar
            ctx.beginPath();
            const r = 3;
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + barW - r, y);
            ctx.quadraticCurveTo(padding.left + barW, y, padding.left + barW, y + r);
            ctx.lineTo(padding.left + barW, y + barHeight - r);
            ctx.quadraticCurveTo(padding.left + barW, y + barHeight, padding.left + barW - r, y + barHeight);
            ctx.lineTo(padding.left, y + barHeight);
            ctx.closePath();
            ctx.fillStyle = colors[i % colors.length];
            ctx.globalAlpha = 0.8;
            ctx.fill();
            ctx.globalAlpha = 1;

            // Label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(label, padding.left - 8, y + barHeight / 2 + 4);

            // Value
            ctx.fillStyle = '#f1f5f9';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(values[i], padding.left + barW + 6, y + barHeight / 2 + 4);
        });
    },

    // ── Line Chart ──
    drawLineChart(canvasId, data) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.scale(dpr, dpr);

        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        const padding = { top: 15, right: 15, bottom: 20, left: 15 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        if (!data || data.length === 0) {
            ctx.fillStyle = '#64748b';
            ctx.font = '13px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Run queries to see timing data', w / 2, h / 2);
            return;
        }

        const maxVal = Math.max(...data, 1);
        const minVal = Math.min(...data, 0);
        const range = maxVal - minVal || 1;

        // Grid lines
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
            const y = padding.top + (i / 3) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartW, y);
            ctx.stroke();

            const val = Math.round(maxVal - (i / 3) * range);
            ctx.fillStyle = '#64748b';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(val + 'ms', padding.left, y - 3);
        }

        // Line + gradient fill
        const points = data.map((val, i) => ({
            x: padding.left + (i / Math.max(data.length - 1, 1)) * chartW,
            y: padding.top + (1 - (val - minVal) / range) * chartH,
        }));

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        ctx.beginPath();
        ctx.moveTo(points[0].x, padding.top + chartH);
        points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Points
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#6366f1';
            ctx.fill();
            ctx.strokeStyle = '#151b2e';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    },
};
