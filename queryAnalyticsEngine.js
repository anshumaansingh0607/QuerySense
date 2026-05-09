/**
 * queryAnalyticsEngine.js
 * 
 * Production-level analytics and telemetry logic for the QuerySense NL-to-SQL system.
 * This iteration addresses advanced query classification (including sorting),
 * specific metric breakdowns, latency penalization, and stricter "no unknown" rules.
 */

class QueryAnalyticsEngine {
  constructor() {
    // In a persistent system, this would be a database connection.
    this.history = [];
  }

  /**
   * 1. Query Classification
   * Detects: "join", "aggregation", "filter", "sorting", "simple".
   * NEVER returns "unknown". Defaults to "simple" if no keywords match.
   * 
   * @param {string} sql - The generated SQL query
   * @returns {string} query type
   */
  classifyQuery(sql) {
    if (!sql || typeof sql !== 'string') return 'simple';
    
    const normalizedSql = sql.toUpperCase().replace(/\s+/g, ' ');
    
    // Order matters: check more complex operations first.
    if (normalizedSql.includes(' JOIN ') || normalizedSql.includes(' INNER JOIN ') || normalizedSql.includes(' LEFT JOIN ')) {
      return 'join';
    }
    
    if (
      normalizedSql.includes(' GROUP BY ') || 
      normalizedSql.includes('SUM(') || 
      normalizedSql.includes('COUNT(') || 
      normalizedSql.includes('AVG(') || 
      normalizedSql.includes('MIN(') || 
      normalizedSql.includes('MAX(')
    ) {
      return 'aggregation';
    }
    
    if (normalizedSql.includes(' WHERE ') || normalizedSql.includes(' HAVING ')) {
      return 'filter';
    }

    if (normalizedSql.includes(' ORDER BY ') || normalizedSql.includes(' LIMIT ')) {
      return 'sorting';
    }
    
    return 'simple';
  }

  /**
   * 2. Compute "Most Common Type"
   * Iterates through the distribution and returns the type with the highest frequency.
   * NEVER returns "unknown". Defaults to "simple" if no data exists.
   * 
   * @param {Object} distribution - An object mapping query types to counts
   * @returns {string} most common query type
   */
  computeMostCommonType(distribution) {
    let mostCommon = 'simple';
    let maxCount = -1;

    for (const [type, count] of Object.entries(distribution)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = type;
      }
    }
    
    return mostCommon;
  }

  /**
   * 3. Calculate Realistic System Intelligence Score
   * Formula: success_rate (50%) + avg_execution_time (30%) + correction_rate (20%)
   * Penalizes high latency and directly limits score based on overall efficiency.
   * 
   * @param {Object} metrics - System metrics object
   * @returns {number} Score out of 100
   */
  calculateSystemScore(metrics) {
    const { success_rate, avg_execution_time, correction_rate } = metrics;
    
    // 50% from Success Rate
    const successScore = (success_rate || 0) * 0.50;
    
    // 30% from Speed (Penalizing large spikes up to 17+ seconds)
    // We treat 0ms as perfect (100% of the 30 points).
    // Let's set the threshold where speed becomes 0 points at 10,000ms (10 seconds).
    let speedPoints = 100 - ((avg_execution_time || 0) / 100); 
    speedPoints = Math.max(0, Math.min(100, speedPoints));
    const speedScore = speedPoints * 0.30;
    
    // 20% from Correction Rate (capability to self-heal)
    // Normalizes successful corrections against total attempts.
    const correctionScore = (correction_rate || 0) * 0.20;
    
    // Total calculation
    const totalScore = successScore + speedScore + correctionScore;
    
    return parseFloat(Math.min(100, Math.max(0, totalScore)).toFixed(1));
  }

  /**
   * 4. Measure Execution Time Helper
   * Safely calculates the duration between start and end.
   */
  measureExecutionTime(startTime, endTime = Date.now()) {
    return Math.max(0, endTime - startTime);
  }

  /**
   * Core orchestrator to log a query and recalculate system metrics.
   * Satisfies: 5. Improve metrics tracking, 6. Structured Output
   * 
   * @param {Object} params - The query execution parameters
   * @returns {Object} Structured API Response
   */
  trackMetrics({ sql, data = [], success, retries = 0, llmTimeMs = 0, dbTimeMs = 0 }) {
    // 4. Execution Time tracking (separated capabilities)
    const totalTimeMs = llmTimeMs + dbTimeMs;
    const query_type = this.classifyQuery(sql);
    
    // Record into history
    this.history.push({
      sql,
      success,
      retries,
      query_type,
      llm_time_ms: llmTimeMs,
      db_time_ms: dbTimeMs,
      total_time_ms: totalTimeMs,
      timestamp: new Date().toISOString()
    });

    // 5. Aggregate overall metrics
    const total_queries = this.history.length;
    let successful_queries = 0;
    let failed_queries = 0;
    let corrected_queries = 0;
    let totalExecTime = 0;

    const query_type_distribution = {
      aggregation: 0,
      join: 0,
      filter: 0,
      sorting: 0,
      simple: 0
    };

    this.history.forEach(q => {
      if (q.success) successful_queries++;
      else failed_queries++;
      
      if (q.retries > 0 && q.success) corrected_queries++;
      
      totalExecTime += q.total_time_ms;
      
      // Safety check: ensure the type exists in our baseline distribution object
      if (query_type_distribution[q.query_type] !== undefined) {
        query_type_distribution[q.query_type]++;
      } else {
        query_type_distribution.simple++;
      }
    });

    const success_rate = total_queries > 0 ? (successful_queries / total_queries) * 100 : 0;
    const correction_rate = total_queries > 0 ? (corrected_queries / total_queries) * 100 : 0;
    const avg_execution_time = total_queries > 0 ? (totalExecTime / total_queries) : 0;

    const metricsPayload = {
      success_rate: parseFloat(success_rate.toFixed(1)),
      correction_rate: parseFloat(correction_rate.toFixed(1)),
      avg_execution_time: parseFloat(avg_execution_time.toFixed(1))
    };

    // Calculate score
    const system_score = this.calculateSystemScore(metricsPayload);
    const most_common_type = this.computeMostCommonType(query_type_distribution);

    // 6. Return strictly requested payload format
    return {
      total_queries,
      success_rate: metricsPayload.success_rate,
      correction_rate: metricsPayload.correction_rate,
      avg_execution_time: metricsPayload.avg_execution_time,
      system_score,
      most_common_type,
      query_type_distribution
    };
  }
}

module.exports = QueryAnalyticsEngine;
