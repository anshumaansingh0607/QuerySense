/**
 * QuerySense — Features Module
 * Export Manager, Voice Input, and Query Diff Viewer
 */

// ═══════════════════════════════════════
//  Export Manager — CSV, JSON, SQL
// ═══════════════════════════════════════

const ExportManager = {
    toCSV(data, columns) {
        if (!data || data.length === 0) return;

        const cols = columns || Object.keys(data[0]);
        const rows = [cols.join(',')];
        data.forEach(row => {
            const values = cols.map(col => {
                const val = row[col];
                if (val == null) return '';
                const str = String(val);
                // Escape quotes and wrap in quotes if contains comma
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            });
            rows.push(values.join(','));
        });

        this._download(rows.join('\n'), 'querysense_results.csv', 'text/csv');
    },

    toJSON(data) {
        if (!data || data.length === 0) return;
        const json = JSON.stringify(data, null, 2);
        this._download(json, 'querysense_results.json', 'application/json');
    },

    toSQL(sql) {
        if (!sql) return;
        const content = `-- QuerySense Generated SQL\n-- ${new Date().toISOString()}\n\n${sql}`;
        this._download(content, 'querysense_query.sql', 'text/sql');
    },

    _download(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },
};

// ═══════════════════════════════════════
//  Voice Input — Web Speech API
// ═══════════════════════════════════════

const VoiceInput = {
    recognition: null,
    isListening: false,
    supported: false,

    init() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            this.supported = false;
            return;
        }

        this.supported = true;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event) => {
            const transcript = Array.from(event.results)
                .map(r => r[0].transcript)
                .join('');
            
            const input = document.getElementById('query-input');
            if (input) input.value = transcript;
        };

        this.recognition.onend = () => {
            this.isListening = false;
            this._updateButton();
        };

        this.recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            this.isListening = false;
            this._updateButton();
        };
    },

    toggle() {
        if (!this.supported) return;

        if (this.isListening) {
            this.recognition.stop();
            this.isListening = false;
        } else {
            this.recognition.start();
            this.isListening = true;
        }
        this._updateButton();
    },

    _updateButton() {
        const btn = document.getElementById('btn-voice');
        if (!btn) return;
        btn.classList.toggle('listening', this.isListening);
        btn.title = this.isListening ? 'Stop listening' : 'Voice input';
    },
};

// ═══════════════════════════════════════
//  Query Diff Viewer — LCS-based word diff
// ═══════════════════════════════════════

const QueryDiff = {
    /**
     * Compute a word-level diff between two SQL strings.
     * Returns an array of {type, text} segments: 'same', 'added', 'removed'
     */
    computeDiff(original, corrected) {
        if (!original || !corrected) return [];

        const oldTokens = this._tokenize(original);
        const newTokens = this._tokenize(corrected);

        // LCS (Longest Common Subsequence)
        const lcs = this._lcs(oldTokens, newTokens);
        const diff = [];

        let oi = 0, ni = 0, li = 0;
        while (oi < oldTokens.length || ni < newTokens.length) {
            if (li < lcs.length && oi < oldTokens.length && oldTokens[oi] === lcs[li]
                && ni < newTokens.length && newTokens[ni] === lcs[li]) {
                diff.push({ type: 'same', text: lcs[li] });
                oi++; ni++; li++;
            } else {
                if (oi < oldTokens.length && (li >= lcs.length || oldTokens[oi] !== lcs[li])) {
                    diff.push({ type: 'removed', text: oldTokens[oi] });
                    oi++;
                }
                if (ni < newTokens.length && (li >= lcs.length || newTokens[ni] !== lcs[li])) {
                    diff.push({ type: 'added', text: newTokens[ni] });
                    ni++;
                }
            }
        }

        return diff;
    },

    /**
     * Render a diff as HTML with colored spans.
     */
    renderDiff(diff) {
        if (!diff || diff.length === 0) {
            return '<span class="diff-same">No differences</span>';
        }

        return diff.map(segment => {
            const escaped = this._escapeHtml(segment.text);
            switch (segment.type) {
                case 'removed':
                    return `<span class="diff-removed">${escaped}</span>`;
                case 'added':
                    return `<span class="diff-added">${escaped}</span>`;
                default:
                    return `<span class="diff-same">${escaped}</span>`;
            }
        }).join(' ');
    },

    /**
     * Create a full diff view container with before/after labels.
     */
    createDiffView(originalSql, correctedSql) {
        const diff = this.computeDiff(originalSql, correctedSql);
        const container = document.createElement('div');
        container.className = 'diff-container';
        container.innerHTML = `
            <div class="diff-header">
                <span class="diff-legend">
                    <span class="diff-removed">removed</span>
                    <span class="diff-added">added</span>
                    <span class="diff-same">unchanged</span>
                </span>
            </div>
            <div class="diff-view">${this.renderDiff(diff)}</div>
        `;
        return container;
    },

    // ── Internal ──

    _tokenize(sql) {
        // Split SQL into meaningful tokens (words, operators, punctuation)
        return sql.trim().split(/(\s+|,|\(|\)|;|\.)/g).filter(t => t.trim().length > 0);
    },

    _lcs(a, b) {
        const m = a.length;
        const n = b.length;
        const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (a[i - 1] === b[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }

        // Backtrack to find LCS sequence
        const result = [];
        let i = m, j = n;
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) {
                result.unshift(a[i - 1]);
                i--; j--;
            } else if (dp[i - 1][j] > dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        return result;
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
};
