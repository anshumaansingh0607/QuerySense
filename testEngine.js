const QueryAnalyticsEngine = require('./queryAnalyticsEngine.js');
const engine = new QueryAnalyticsEngine();

console.log("🚀 Starting Updated QueryAnalyticsEngine Test...\n");

// 1. Simulate a successful simple query (Testing simple)
console.log("1. Running Simple Query...");
const res1 = engine.trackMetrics({
    sql: "SELECT * FROM users",
    data: [{ id: 1, name: "Alice" }],
    success: true,
    retries: 0,
    llmTimeMs: 400,
    dbTimeMs: 45
});
console.log("Analytics Payload 1:", JSON.stringify(res1, null, 2));

// 2. Simulate a failed sorting query (Testing sorting & latency penalty)
// 15 seconds latency = huge penalty to system score
console.log("\n2. Running Slow Failed Query...");
const res2 = engine.trackMetrics({
    sql: "SELECT * FROM logs ORDER BY created_at DESC",
    data: [],
    success: false,
    retries: 0, 
    llmTimeMs: 2000,
    dbTimeMs: 15000 // 17s total -> Will severely drop the speedScore
});
console.log("Analytics Payload 2:", JSON.stringify(res2, null, 2));

// 3. Simulate a successful retry with aggregation
console.log("\n3. Running Corrected Query (Aggregation)...");
const res3 = engine.trackMetrics({
    sql: "SELECT COUNT(*) FROM logs",
    data: [{ "COUNT(*)": 42 }],
    success: true,
    retries: 1, // Represents a successful retry
    llmTimeMs: 600,
    dbTimeMs: 120
});
console.log("Analytics Payload 3:", JSON.stringify(res3, null, 2));

// 4. Simulate an unknown fallback logic 
console.log("\n4. Running Query with No Matches (Fallback to 'simple')...");
const res4 = engine.trackMetrics({
    sql: "DELETE FROM memory", // No keywords matching JOIN, GROUP BY, WHERE, ORDER BY
    data: [],
    success: true,
    retries: 0,
    llmTimeMs: 300,
    dbTimeMs: 150
});
console.log("Analytics Payload 4:", JSON.stringify(res4, null, 2));

console.log("\n✅ All advanced tests complete!");
