/**
 * QuerySense — API Client
 * Handles all communication with the FastAPI backend.
 */

class QuerySenseAPI {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Submit a natural language query for SQL translation and execution.
     */
    async submitQuery(query, dbId = 'sales_db', signal = null) {
        const response = await this._request('/api/query', {
            method: 'POST',
            body: JSON.stringify({ query, db_id: dbId }),
            signal: signal,
        });
        return response;
    }

    /**
     * Submit a clarified query after ambiguity detection.
     */
    async submitClarification(originalQuery, clarification, dbId = 'sales_db') {
        const response = await this._request('/api/query/clarify', {
            method: 'POST',
            body: JSON.stringify({
                original_query: originalQuery,
                clarification: clarification,
                db_id: dbId,
            }),
        });
        return response;
    }

    /**
     * Check schema drift status.
     */
    async getSchemaStatus(dbId = 'sales_db') {
        return this._request(`/api/schema/status?db_id=${dbId}`);
    }

    /**
     * Force schema re-introspection.
     */
    async refreshSchema(dbId = 'sales_db') {
        return this._request(`/api/schema/refresh?db_id=${dbId}`, {
            method: 'POST',
        });
    }

    /**
     * Get table and column info for display.
     */
    async getSchemaTables(dbId = 'sales_db') {
        return this._request(`/api/schema/tables?db_id=${dbId}`);
    }

    /**
     * Get recent query history.
     */
    async getHistory() {
        return this._request('/api/history');
    }



    /**
     * Get system analytics (computed from real query history).
     */
    async getAnalytics() {
        return this._request('/api/analytics');
    }

    /**
     * Get system config (current provider, available providers).
     */
    async getConfig() {
        return this._request('/api/config');
    }

    /**
     * Switch LLM provider at runtime.
     */
    async switchProvider(provider, apiKey = null) {
        const body = { provider };
        if (apiKey) body.api_key = apiKey;
        return this._request('/api/config/provider', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    /**
     * Health check.
     */
    async healthCheck() {
        return this._request('/health');
    }

    /**
     * Internal request handler with error handling.
     */
    async _request(path, options = {}) {
        const url = `${this.baseUrl}${path}`;

        const headers = options.headers || {};
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }

        const config = {
            ...options,
            headers,
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Unable to connect to QuerySense backend. Is the server running?');
            }
            throw error;
        }
    }
}

const api = new QuerySenseAPI();
