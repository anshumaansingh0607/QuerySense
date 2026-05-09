"""
QuerySense — Prompt Templates
All structured prompts for the LLM pipeline stages.
"""

SYSTEM_PROMPT = """You are QuerySense, an expert SQL assistant. You translate natural language questions into precise, executable SQL queries with detailed structured reasoning.

Rules:
- Generate ONLY valid SQL for the given database schema
- Use the exact table and column names from the schema
- Always include appropriate JOIN conditions when querying multiple tables
- Prefer explicit column names over SELECT *
- Use appropriate aggregation functions (SUM, COUNT, AVG, etc.) when the question implies them
- Add sensible ORDER BY and LIMIT clauses when appropriate
- For date ranges, use standard SQL date comparisons
- Always respond with valid JSON in the requested format
- Provide detailed structured reasoning explaining EVERY decision"""

SQL_GENERATION_PROMPT = """Given the following database schema:

{schema}

Translate this natural language question into a SQL query:
"{query}"

Respond in this exact JSON format:
{{
    "sql": "YOUR SQL QUERY HERE",
    "reasoning": {{
        "intent": "A clear one-sentence description of what the user wants to know",
        "tables_used": [
            {{"name": "table_name", "reason": "Why this table is needed"}}
        ],
        "columns_selected": [
            {{"name": "column_or_expression", "reason": "Why this column is included"}}
        ],
        "filters": [
            {{"condition": "WHERE clause condition", "reason": "Why this filter is applied"}}
        ],
        "joins": [
            {{"tables": "table1 → table2", "condition": "join condition", "type": "JOIN type", "reason": "Why these tables need to be linked"}}
        ],
        "aggregations": [
            {{"function": "SUM/COUNT/AVG/etc", "column": "column_name", "alias": "result_name", "reason": "Why this aggregation is used"}}
        ],
        "sorting": [
            {{"column": "column_name", "direction": "ASC/DESC", "reason": "Why this ordering is applied"}}
        ],
        "assumptions": ["Any assumptions made about the user's intent"]
    }}
}}

REASONING GUIDELINES:
- intent: Be specific about the user's goal — not generic
- tables_used: Explain WHY each table is necessary (mention foreign keys if joining)
- columns_selected: Explain what each column provides and why it's relevant
- filters: Explain the business logic behind each WHERE condition
- joins: Explain the relationship between tables and why the join type was chosen
- aggregations: Explain what each function computes and why it answers the question
- sorting: Explain why the ordering is meaningful for the results
- assumptions: List any ambiguities resolved or defaults chosen

IMPORTANT:
- Respond ONLY with the JSON object, no other text
- The SQL must be valid and executable against the given schema
- Every reasoning field must be substantive — never use generic phrases like "fetches data" """

AMBIGUITY_SCORING_PROMPT = """Given the following database schema:

{schema}

Evaluate the clarity of this natural language query:
"{query}"

Respond in this exact JSON format:
{{
    "confidence_score": 0.85,
    "is_ambiguous": false,
    "ambiguities": [],
    "clarification_question": ""
}}

Scoring guidelines:
- 0.9-1.0: Crystal clear, maps directly to specific tables/columns
- 0.7-0.9: Mostly clear, minor assumptions needed
- 0.5-0.7: Somewhat ambiguous, could mean multiple things
- 0.0-0.5: Very vague, needs significant clarification

If ambiguous, list specific ambiguities and provide a targeted clarification question.
Examples of ambiguities:
- "revenue" could mean total_amount from orders or unit_price * quantity from order_items
- "recent" is undefined — last week? last month? last quarter?
- "top customers" — by order count? by total spending? by recent activity?

Respond ONLY with the JSON object."""

SELF_CORRECTION_PROMPT = """The previous SQL query failed when executed against the database.

Database schema:
{schema}

Original user question: "{query}"

Failed SQL:
```sql
{failed_sql}
```

Error message:
{error}

Previous attempts and their errors:
{history}

Analyze the error carefully and generate a corrected SQL query.

Common fixes:
- "no such column" → Check the schema for the correct column name
- "no such table" → Verify the table name against the schema
- "ambiguous column" → Add table alias prefix (e.g., t.column_name)
- "syntax error" → Fix SQL syntax (missing commas, parentheses, keywords)
- Date extraction errors → Remember this is SQLite! Do NOT use EXTRACT() or YEAR()/MONTH() functions. You MUST use strftime() instead.

Respond in this exact JSON format:
{{
    "sql": "YOUR CORRECTED SQL QUERY HERE",
    "explanation": "What was wrong with the previous query and how you fixed it",
    "fix_description": "Brief description of the fix"
}}

Respond ONLY with the JSON object."""

SCHEMA_DRIFT_EXPLANATION = """The database schema has changed since the last check.

Changes detected:
{changes}

Previous schema hash: {old_hash}
Current schema hash: {new_hash}

Explain these changes in plain English for a non-technical user and note any queries that might be affected."""
