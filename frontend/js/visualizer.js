/**
 * QuerySense — Smart Auto-Visualizer & Data Insights
 * 
 * Feature 1: Auto-detects result shape and renders the best chart type
 *   - Single aggregate value → Big Number display
 *   - Category + number → Bar chart
 *   - Few categories + count → Donut chart
 *   - Date/time + number → Line chart
 * 
 * Feature 2: Generates plain-English insight summaries from the data
 *   - No LLM call needed — pure client-side intelligence
 *   - Identifies top values, totals, averages, distributions
 */

const SmartViz = {
    /**
     * Analyze result data and render appropriate visualization + insights.
     * Called after each successful query in the Data tab.
     */
    render(containerId, data, columns) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (!data || data.length === 0) return;

        const cols = columns || Object.keys(data[0]);
        const analysis = this._analyzeShape(data, cols);

        if (!analysis) return;

        // Build the visualization card
        const card = document.createElement('div');
        card.className = 'viz-card';
        card.innerHTML = `
            <div class="viz-header">
                <div class="viz-title">
                    <span class="viz-icon">${analysis.icon}</span>
                    <span>${analysis.title}</span>
                </div>
                <span class="viz-type-badge">${analysis.chartType}</span>
            </div>
            <div class="viz-body">
                <div class="viz-chart-area">
                    ${analysis.chartType === 'big-number' ? '' : `<canvas id="viz-canvas" width="500" height="220"></canvas>`}
                    ${analysis.chartType === 'big-number' ? this._renderBigNumber(analysis) : ''}
                </div>
                <div class="viz-insight" id="viz-insight">
                    <div class="viz-insight-icon">💡</div>
                    <div class="viz-insight-text">${analysis.insight}</div>
                </div>
            </div>
        `;
        container.appendChild(card);

        // Draw canvas chart after DOM mount
        if (analysis.chartType !== 'big-number') {
            requestAnimationFrame(() => {
                const canvas = document.getElementById('viz-canvas');
                if (!canvas) return;
                if (analysis.chartType === 'bar') this._drawBarChart(canvas, analysis);
                else if (analysis.chartType === 'donut') this._drawDonutChart(canvas, analysis);
                else if (analysis.chartType === 'line') this._drawLineChart(canvas, analysis);
            });
        }
    },

    // ══════════════════════════════════════
    //  Data Shape Analysis
    // ══════════════════════════════════════
    _analyzeShape(data, cols) {
        // Case 1: Single row, single column → Big Number
        if (data.length === 1 && cols.length <= 2) {
            const val = data[0][cols[cols.length - 1]];
            if (typeof val === 'number' || !isNaN(Number(val))) {
                return {
                    chartType: 'big-number',
                    icon: '🔢',
                    title: 'Result',
                    label: this._humanizeColumn(cols[cols.length - 1]),
                    value: Number(val),
                    insight: this._generateBigNumberInsight(cols[cols.length - 1], Number(val)),
                };
            }
        }

        // Find category and numeric columns
        const numericCols = cols.filter(c => data.every(r => r[c] === null || !isNaN(Number(r[c]))));
        const textCols = cols.filter(c => !numericCols.includes(c));
        const dateCols = cols.filter(c => this._isDateColumn(c, data));

        // Case 2: Date column + numeric → Line Chart
        if (dateCols.length > 0 && numericCols.length > 0) {
            const dateCol = dateCols[0];
            const valCol = numericCols.find(c => c !== dateCol) || numericCols[0];
            const labels = data.map(r => String(r[dateCol]));
            const values = data.map(r => Number(r[valCol]) || 0);
            return {
                chartType: 'line',
                icon: '📈',
                title: `${this._humanizeColumn(valCol)} Over Time`,
                labels,
                values,
                valLabel: this._humanizeColumn(valCol),
                insight: this._generateLineInsight(labels, values, valCol),
            };
        }

        // Case 3: Category + numeric with few rows → Donut
        if (textCols.length > 0 && numericCols.length > 0 && data.length <= 6 && data.length >= 2) {
            const catCol = textCols[0];
            const valCol = numericCols[numericCols.length - 1];
            const labels = data.map(r => String(r[catCol]));
            const values = data.map(r => Number(r[valCol]) || 0);
            return {
                chartType: 'donut',
                icon: '🍩',
                title: `${this._humanizeColumn(valCol)} by ${this._humanizeColumn(catCol)}`,
                labels,
                values,
                insight: this._generateDonutInsight(labels, values, catCol, valCol),
            };
        }

        // Case 4: Category + numeric with more rows → Bar Chart
        if (textCols.length > 0 && numericCols.length > 0) {
            const catCol = textCols[0];
            const valCol = numericCols[numericCols.length - 1];
            const slicedData = data.slice(0, 12); // Max 12 bars
            const labels = slicedData.map(r => String(r[catCol]));
            const values = slicedData.map(r => Number(r[valCol]) || 0);
            return {
                chartType: 'bar',
                icon: '📊',
                title: `${this._humanizeColumn(valCol)} by ${this._humanizeColumn(catCol)}`,
                labels,
                values,
                valLabel: this._humanizeColumn(valCol),
                insight: this._generateBarInsight(labels, values, catCol, valCol, data.length),
            };
        }

        return null; // Can't visualize
    },

    _isDateColumn(colName, data) {
        const name = colName.toLowerCase();
        if (/date|time|month|year|day|created|updated|period/.test(name)) return true;
        // Check if values look like dates
        const sample = data.slice(0, 3).map(r => String(r[colName]));
        return sample.every(v => /^\d{4}[-/]/.test(v));
    },

    _humanizeColumn(col) {
        return col
            .replace(/^(.*\.)/, '')          // Remove table prefix
            .replace(/_/g, ' ')               // Underscores to spaces
            .replace(/\b\w/g, c => c.toUpperCase()) // Title case
            .replace(/\bAs\b.*$/i, '')        // Remove AS aliases
            .trim();
    },

    // ══════════════════════════════════════
    //  Insight Generation (Client-Side AI)
    // ══════════════════════════════════════
    _generateBigNumberInsight(colName, value) {
        const name = this._humanizeColumn(colName);
        if (/revenue|amount|spent|price|cost|total/i.test(colName)) {
            return `The ${name.toLowerCase()} is <strong>${this._formatCurrency(value)}</strong>.`;
        }
        if (/count|number|qty|quantity/i.test(colName)) {
            return `There are <strong>${this._formatNumber(value)}</strong> ${name.toLowerCase()} in total.`;
        }
        if (/avg|average|mean/i.test(colName)) {
            return `The ${name.toLowerCase()} comes out to <strong>${this._formatNumber(value)}</strong>.`;
        }
        return `The ${name.toLowerCase()} is <strong>${this._formatNumber(value)}</strong>.`;
    },

    _generateBarInsight(labels, values, catCol, valCol, totalRows) {
        const maxIdx = values.indexOf(Math.max(...values));
        const minIdx = values.indexOf(Math.min(...values));
        const total = values.reduce((a, b) => a + b, 0);
        const topPct = total > 0 ? Math.round((values[maxIdx] / total) * 100) : 0;
        const cat = this._humanizeColumn(catCol).toLowerCase();

        let insight = `<strong>${labels[maxIdx]}</strong> leads with ${this._formatSmartValue(values[maxIdx], valCol)} (${topPct}% of total)`;
        if (labels.length > 1) {
            insight += `, while <strong>${labels[minIdx]}</strong> has the lowest at ${this._formatSmartValue(values[minIdx], valCol)}`;
        }
        if (totalRows > 12) {
            insight += `. Showing top 12 of ${totalRows} ${cat}s`;
        }
        return insight + '.';
    },

    _generateDonutInsight(labels, values, catCol, valCol) {
        const total = values.reduce((a, b) => a + b, 0);
        const sorted = labels.map((l, i) => ({ label: l, value: values[i], pct: total > 0 ? Math.round((values[i] / total) * 100) : 0 }))
            .sort((a, b) => b.value - a.value);

        if (sorted.length <= 3) {
            const parts = sorted.map(s => `<strong>${s.label}</strong> (${s.pct}%)`);
            return `Distribution: ${parts.join(', ')}. Total: ${this._formatSmartValue(total, valCol)}.`;
        }
        return `<strong>${sorted[0].label}</strong> dominates at ${sorted[0].pct}%, followed by <strong>${sorted[1].label}</strong> at ${sorted[1].pct}%. Total: ${this._formatSmartValue(total, valCol)}.`;
    },

    _generateLineInsight(labels, values, valCol) {
        const first = values[0];
        const last = values[values.length - 1];
        const max = Math.max(...values);
        const min = Math.min(...values);
        const maxIdx = values.indexOf(max);
        const trend = last > first ? '📈 upward' : last < first ? '📉 downward' : '➡️ flat';
        const changePct = first !== 0 ? Math.round(((last - first) / Math.abs(first)) * 100) : 0;

        let insight = `Trend is <strong>${trend}</strong>`;
        if (changePct !== 0) insight += ` (${changePct > 0 ? '+' : ''}${changePct}%)`;
        insight += `. Peak of ${this._formatSmartValue(max, valCol)} at <strong>${labels[maxIdx]}</strong>`;
        if (min !== max) insight += `, low of ${this._formatSmartValue(min, valCol)}`;
        return insight + '.';
    },

    _formatCurrency(n) {
        if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
        return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    _formatNumber(n) {
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
        return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
    },

    _formatSmartValue(n, colName) {
        if (/revenue|amount|spent|price|cost|total|value/i.test(colName)) return this._formatCurrency(n);
        return this._formatNumber(n);
    },

    // ══════════════════════════════════════
    //  Big Number Renderer
    // ══════════════════════════════════════
    _renderBigNumber(analysis) {
        const formatted = /revenue|amount|spent|price|cost|total/i.test(analysis.label)
            ? this._formatCurrency(analysis.value)
            : this._formatNumber(analysis.value);
        return `
            <div class="viz-big-number">
                <div class="viz-big-value">${formatted}</div>
                <div class="viz-big-label">${analysis.label}</div>
            </div>
        `;
    },

    // ══════════════════════════════════════
    //  Canvas Chart Renderers
    // ══════════════════════════════════════
    _setupCanvas(canvas) {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        return { ctx, w: canvas.clientWidth, h: canvas.clientHeight };
    },

    _drawBarChart(canvas, analysis) {
        const { ctx, w, h } = this._setupCanvas(canvas);
        const { labels, values } = analysis;
        const colors = ['#6366f1', '#8b5cf6', '#a78bfa', '#818cf8', '#7c3aed', '#6d28d9', '#5b21b6', '#4f46e5', '#4338ca', '#3730a3', '#c084fc', '#a855f7'];
        const padding = { top: 20, right: 20, bottom: 50, left: 20 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const maxVal = Math.max(...values, 1);
        const barWidth = (chartW / labels.length) * 0.6;
        const gap = chartW / labels.length;

        values.forEach((val, i) => {
            const barH = (val / maxVal) * chartH;
            const x = padding.left + i * gap + (gap - barWidth) / 2;
            const y = padding.top + chartH - barH;

            // Gradient bar
            const grad = ctx.createLinearGradient(x, y, x, y + barH);
            grad.addColorStop(0, colors[i % colors.length]);
            grad.addColorStop(1, colors[i % colors.length] + '88');

            const r = Math.min(4, barWidth / 4);
            ctx.beginPath();
            ctx.moveTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.lineTo(x + barWidth - r, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
            ctx.lineTo(x + barWidth, padding.top + chartH);
            ctx.lineTo(x, padding.top + chartH);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            // Value label
            if (val > 0) {
                ctx.fillStyle = '#f1f5f9';
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'center';
                const display = val >= 1e6 ? (val/1e6).toFixed(1)+'M' : val >= 1e3 ? (val/1e3).toFixed(1)+'K' : val.toLocaleString();
                ctx.fillText(display, x + barWidth / 2, y - 6);
            }

            // Category label
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            const label = labels[i].length > 12 ? labels[i].substring(0, 11) + '…' : labels[i];
            ctx.save();
            ctx.translate(x + barWidth / 2, padding.top + chartH + 14);
            ctx.rotate(-0.3);
            ctx.fillText(label, 0, 0);
            ctx.restore();
        });
    },

    _drawDonutChart(canvas, analysis) {
        const { ctx, w, h } = this._setupCanvas(canvas);
        const { labels, values } = analysis;
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6'];
        const cx = w * 0.38;
        const cy = h / 2;
        const radius = Math.min(cx, cy) - 20;
        const innerRadius = radius * 0.55;
        const total = values.reduce((a, b) => a + b, 0);

        if (total === 0) return;

        let startAngle = -Math.PI / 2;
        const segments = [];

        values.forEach((val, i) => {
            const sliceAngle = (val / total) * Math.PI * 2;
            const color = colors[i % colors.length];

            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
            ctx.arc(cx, cy, innerRadius, startAngle + sliceAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();

            segments.push({ label: labels[i], color, pct: Math.round((val / total) * 100) });
            startAngle += sliceAngle;
        });

        // Center text
        ctx.fillStyle = '#f1f5f9';
        ctx.font = 'bold 20px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(total >= 1e3 ? (total/1e3).toFixed(1)+'K' : total.toLocaleString(), cx, cy + 4);
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText('total', cx, cy + 18);

        // Legend (right side)
        const legendX = w * 0.68;
        let legendY = Math.max(20, cy - (segments.length * 22) / 2);
        segments.forEach(seg => {
            ctx.fillStyle = seg.color;
            ctx.fillRect(legendX, legendY, 10, 10);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '11px Inter, sans-serif';
            ctx.textAlign = 'left';
            const txt = seg.label.length > 14 ? seg.label.substring(0, 13) + '…' : seg.label;
            ctx.fillText(`${txt} (${seg.pct}%)`, legendX + 16, legendY + 9);
            legendY += 22;
        });
    },

    _drawLineChart(canvas, analysis) {
        const { ctx, w, h } = this._setupCanvas(canvas);
        const { labels, values } = analysis;
        const padding = { top: 20, right: 20, bottom: 40, left: 20 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        const maxVal = Math.max(...values, 1);
        const minVal = Math.min(...values, 0);
        const range = maxVal - minVal || 1;

        // Grid
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
            const y = padding.top + (i / 3) * chartH;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartW, y);
            ctx.stroke();
        }

        const points = values.map((val, i) => ({
            x: padding.left + (i / Math.max(values.length - 1, 1)) * chartW,
            y: padding.top + (1 - (val - minVal) / range) * chartH,
        }));

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
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
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();

        // Points
        points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#6366f1';
            ctx.fill();
            ctx.strokeStyle = '#151b2e';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // X-axis labels (show first, middle, last)
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px Inter, sans-serif';
        const showIndices = labels.length <= 6
            ? labels.map((_, i) => i)
            : [0, Math.floor(labels.length / 2), labels.length - 1];
        showIndices.forEach(i => {
            const lbl = labels[i].length > 10 ? labels[i].substring(0, 9) + '…' : labels[i];
            ctx.textAlign = 'center';
            ctx.fillText(lbl, points[i].x, padding.top + chartH + 18);
        });
    },
};
