"""
QuerySense — LLM Provider Abstraction
Supports OpenAI, Anthropic, and a Mock provider for demo mode.
"""

import json
import re
import random
from abc import ABC, abstractmethod
from typing import Optional


class LLMProvider(ABC):
    """Base class for LLM providers."""

    @abstractmethod
    def complete(self, prompt: str, system_prompt: str = "") -> str:
        """Send a prompt to the LLM and return the text response."""
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass


class OpenAIProvider(LLMProvider):
    """OpenAI GPT provider."""

    def __init__(self, api_key: str, model: str = "gpt-4o"):
        try:
            from openai import OpenAI
            self._client = OpenAI(api_key=api_key)
        except ImportError:
            raise ImportError("OpenAI package not installed. Run: pip install openai")
        except Exception as e:
            raise ValueError(f"Failed to initialize OpenAI client: {e}")
        self._model = model

    def complete(self, prompt: str, system_prompt: str = "") -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=0.1,
                max_tokens=2048,
                timeout=30,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise RuntimeError(f"OpenAI API call failed: {e}")

    @property
    def name(self) -> str:
        return f"OpenAI ({self._model})"


class AnthropicProvider(LLMProvider):
    """Anthropic Claude provider."""

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        try:
            from anthropic import Anthropic
            self._client = Anthropic(api_key=api_key)
        except ImportError:
            raise ImportError("Anthropic package not installed. Run: pip install anthropic")
        except Exception as e:
            raise ValueError(f"Failed to initialize Anthropic client: {e}")
        self._model = model

    def complete(self, prompt: str, system_prompt: str = "") -> str:
        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=2048,
                system=system_prompt if system_prompt else "You are a helpful assistant.",
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
            )
            return response.content[0].text
        except Exception as e:
            raise RuntimeError(f"Anthropic API call failed: {e}")

    @property
    def name(self) -> str:
        return f"Anthropic ({self._model})"


class GroqProvider(LLMProvider):
    """Groq API provider."""

    def __init__(self, api_key: str, model: str = "llama3-8b-8192"):
        try:
            from groq import Groq
            self._client = Groq(api_key=api_key)
        except ImportError:
            raise ImportError("Groq package not installed. Run: pip install groq")
        except Exception as e:
            raise ValueError(f"Failed to initialize Groq client: {e}")
        self._model = model

    def complete(self, prompt: str, system_prompt: str = "") -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                temperature=0.1,
                max_tokens=2048,
            )
            return response.choices[0].message.content
        except Exception as e:
            raise RuntimeError(f"Groq API call failed: {e}")

    @property
    def name(self) -> str:
        return f"Groq ({self._model})"


class MockProvider(LLMProvider):
    """
    Pattern-based mock LLM for demo mode.
    Generates realistic SQL responses with structured reasoning.
    """

    def complete(self, prompt: str, system_prompt: str = "") -> str:
        prompt_lower = prompt.lower()

        # ── Ambiguity Scoring ──
        if "evaluate the clarity" in prompt_lower or "confidence_score" in prompt_lower:
            return self._mock_ambiguity_score(prompt_lower)

        # ── Self-Correction ──
        if "failed sql" in prompt_lower or "error message" in prompt_lower:
            return self._mock_correction(prompt)

        # ── SQL Generation ──
        return self._mock_sql_generation(prompt_lower, prompt)

    def _mock_sql_generation(self, prompt_lower: str, prompt: str) -> str:
        """Generate SQL with structured reasoning based on pattern matching."""
        
        # Extract the actual user query from the prompt
        query_match = re.search(r'\"(.+?)\"', prompt)
        user_query = query_match.group(1).lower() if query_match else prompt_lower

        # ── Pattern: Show all / list all ──
        if any(kw in user_query for kw in ["show all customer", "list all customer", "all customers", "get all customer"]):
            return json.dumps({
                "sql": "SELECT id, name, email, region, signup_date FROM customers ORDER BY name",
                "reasoning": {
                    "intent": "Retrieve a complete list of all customers with their contact and registration details",
                    "tables_used": [
                        {"name": "customers", "reason": "Primary table containing all customer records including name, email, region, and signup date"}
                    ],
                    "columns_selected": [
                        {"name": "id", "reason": "Unique identifier for each customer"},
                        {"name": "name", "reason": "Customer's full name — the primary display field"},
                        {"name": "email", "reason": "Contact email address"},
                        {"name": "region", "reason": "Geographic region for business segmentation"},
                        {"name": "signup_date", "reason": "When the customer registered"}
                    ],
                    "filters": [],
                    "joins": [],
                    "aggregations": [],
                    "sorting": [
                        {"column": "name", "direction": "ASC", "reason": "Alphabetical ordering for easy lookup"}
                    ],
                    "assumptions": ["Returning all columns except internal metadata", "Ordering alphabetically by name for readability"]
                }
            })

        if any(kw in user_query for kw in ["show all product", "list all product", "all products", "get all product"]):
            return json.dumps({
                "sql": "SELECT id, name, category, price, stock_qty FROM products ORDER BY category, name",
                "reasoning": {
                    "intent": "List all products organized by category with pricing and inventory details",
                    "tables_used": [
                        {"name": "products", "reason": "Contains all product catalog data including name, category, pricing, and stock levels"}
                    ],
                    "columns_selected": [
                        {"name": "id", "reason": "Unique product identifier"},
                        {"name": "name", "reason": "Product display name"},
                        {"name": "category", "reason": "Product category for grouping (Electronics, Furniture, Office Supplies)"},
                        {"name": "price", "reason": "Unit price of the product"},
                        {"name": "stock_qty", "reason": "Current inventory level"}
                    ],
                    "filters": [],
                    "joins": [],
                    "aggregations": [],
                    "sorting": [
                        {"column": "category", "direction": "ASC", "reason": "Group products by category first"},
                        {"column": "name", "direction": "ASC", "reason": "Then alphabetically within each category"}
                    ],
                    "assumptions": ["Grouping by category for better readability"]
                }
            })

        if any(kw in user_query for kw in ["show all order", "list all order", "all orders", "get all order"]):
            return json.dumps({
                "sql": "SELECT o.id, c.name AS customer_name, o.order_date, o.total_amount, o.status FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.order_date DESC",
                "reasoning": {
                    "intent": "Display all orders with customer names, dates, amounts, and fulfillment status",
                    "tables_used": [
                        {"name": "orders", "reason": "Primary table containing order records with dates, amounts, and status"},
                        {"name": "customers", "reason": "Joined to resolve customer_id into readable customer names"}
                    ],
                    "columns_selected": [
                        {"name": "o.id", "reason": "Order identifier"},
                        {"name": "c.name AS customer_name", "reason": "Human-readable customer name instead of raw ID"},
                        {"name": "o.order_date", "reason": "When the order was placed"},
                        {"name": "o.total_amount", "reason": "Total monetary value of the order"},
                        {"name": "o.status", "reason": "Current fulfillment status (pending, shipped, completed, cancelled)"}
                    ],
                    "filters": [],
                    "joins": [
                        {"tables": "orders → customers", "condition": "o.customer_id = c.id", "type": "INNER JOIN", "reason": "Link each order to its customer via the customer_id foreign key to display customer names"}
                    ],
                    "aggregations": [],
                    "sorting": [
                        {"column": "o.order_date", "direction": "DESC", "reason": "Most recent orders appear first for relevance"}
                    ],
                    "assumptions": ["Including customer name for context", "Sorting by most recent first"]
                }
            })

        # ── Pattern: Total revenue / total sales ──
        if any(kw in user_query for kw in ["total revenue", "total sales", "total amount"]):
            if "region" in user_query:
                return json.dumps({
                    "sql": "SELECT c.region, SUM(o.total_amount) AS total_revenue FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = 'completed' GROUP BY c.region ORDER BY total_revenue DESC",
                    "reasoning": {
                        "intent": "Calculate total revenue broken down by geographic region, considering only completed orders",
                        "tables_used": [
                            {"name": "orders", "reason": "Contains total_amount for each order and status to filter completed transactions"},
                            {"name": "customers", "reason": "Contains the region field — linked via customer_id foreign key"}
                        ],
                        "columns_selected": [
                            {"name": "c.region", "reason": "Geographic grouping dimension"},
                            {"name": "SUM(o.total_amount) AS total_revenue", "reason": "Aggregated revenue per region"}
                        ],
                        "filters": [
                            {"condition": "o.status = 'completed'", "reason": "Only completed orders represent actual realized revenue — excludes pending, shipped, and cancelled orders"}
                        ],
                        "joins": [
                            {"tables": "orders → customers", "condition": "o.customer_id = c.id", "type": "INNER JOIN", "reason": "Required to access customer.region since orders table only stores customer_id"}
                        ],
                        "aggregations": [
                            {"function": "SUM", "column": "o.total_amount", "alias": "total_revenue", "reason": "Sum all order amounts within each region to get total revenue"}
                        ],
                        "sorting": [
                            {"column": "total_revenue", "direction": "DESC", "reason": "Highest-revenue regions shown first for quick identification of top markets"}
                        ],
                        "assumptions": ["Only counting completed orders as revenue", "Grouping by customer region"]
                    }
                })
            if "month" in user_query or "monthly" in user_query:
                return json.dumps({
                    "sql": "SELECT strftime('%Y-%m', o.order_date) AS month, SUM(o.total_amount) AS total_revenue FROM orders o WHERE o.status = 'completed' GROUP BY month ORDER BY month",
                    "reasoning": {
                        "intent": "Analyze monthly revenue trends over time using completed orders only",
                        "tables_used": [
                            {"name": "orders", "reason": "Contains order dates and amounts needed for monthly revenue calculation"}
                        ],
                        "columns_selected": [
                            {"name": "strftime('%Y-%m', o.order_date) AS month", "reason": "Extract year-month from order date for monthly grouping"},
                            {"name": "SUM(o.total_amount) AS total_revenue", "reason": "Total revenue for each month"}
                        ],
                        "filters": [
                            {"condition": "o.status = 'completed'", "reason": "Only completed orders count as realized revenue"}
                        ],
                        "joins": [],
                        "aggregations": [
                            {"function": "SUM", "column": "o.total_amount", "alias": "total_revenue", "reason": "Aggregate all completed order amounts within each month"},
                            {"function": "strftime", "column": "o.order_date", "alias": "month", "reason": "SQLite date function to extract YYYY-MM format for grouping"}
                        ],
                        "sorting": [
                            {"column": "month", "direction": "ASC", "reason": "Chronological order to show revenue trend over time"}
                        ],
                        "assumptions": ["Only counting completed orders", "Using SQLite strftime for month extraction"]
                    }
                })
            if "category" in user_query:
                return json.dumps({
                    "sql": "SELECT p.category, SUM(oi.quantity * oi.unit_price) AS total_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE o.status = 'completed' GROUP BY p.category ORDER BY total_revenue DESC",
                    "reasoning": {
                        "intent": "Calculate total revenue per product category using line-item-level data for accuracy",
                        "tables_used": [
                            {"name": "order_items", "reason": "Contains quantity and unit_price for accurate revenue calculation at the line-item level"},
                            {"name": "products", "reason": "Contains the category field to group revenue by product type"},
                            {"name": "orders", "reason": "Used to filter for completed orders only"}
                        ],
                        "columns_selected": [
                            {"name": "p.category", "reason": "Product category as the grouping dimension"},
                            {"name": "SUM(oi.quantity * oi.unit_price) AS total_revenue", "reason": "Line-item revenue = quantity × unit_price, summed per category"}
                        ],
                        "filters": [
                            {"condition": "o.status = 'completed'", "reason": "Only realized revenue from completed orders"}
                        ],
                        "joins": [
                            {"tables": "order_items → products", "condition": "oi.product_id = p.id", "type": "INNER JOIN", "reason": "Link each line item to its product to access the category field"},
                            {"tables": "order_items → orders", "condition": "oi.order_id = o.id", "type": "INNER JOIN", "reason": "Link line items to orders to filter by completion status"}
                        ],
                        "aggregations": [
                            {"function": "SUM", "column": "oi.quantity * oi.unit_price", "alias": "total_revenue", "reason": "Multiply quantity by price for each item, then sum within each category"}
                        ],
                        "sorting": [
                            {"column": "total_revenue", "direction": "DESC", "reason": "Highest-revenue categories listed first"}
                        ],
                        "assumptions": ["Revenue = quantity × unit_price from order_items", "Only counting completed orders"]
                    }
                })
            return json.dumps({
                "sql": "SELECT SUM(total_amount) AS total_revenue FROM orders WHERE status = 'completed'",
                "reasoning": {
                    "intent": "Calculate the overall total revenue from all completed orders",
                    "tables_used": [
                        {"name": "orders", "reason": "Contains total_amount and status fields needed for revenue aggregation"}
                    ],
                    "columns_selected": [
                        {"name": "SUM(total_amount) AS total_revenue", "reason": "Single aggregate value representing total business revenue"}
                    ],
                    "filters": [
                        {"condition": "status = 'completed'", "reason": "Only completed orders represent actual earned revenue — pending and cancelled orders are excluded"}
                    ],
                    "joins": [],
                    "aggregations": [
                        {"function": "SUM", "column": "total_amount", "alias": "total_revenue", "reason": "Sum all completed order amounts into a single revenue figure"}
                    ],
                    "sorting": [],
                    "assumptions": ["Only completed orders count as revenue", "Using total_amount from orders table"]
                }
            })

        # ── Pattern: Count ──
        if any(kw in user_query for kw in ["how many", "count", "number of"]):
            if "customer" in user_query:
                if "region" in user_query:
                    return json.dumps({
                        "sql": "SELECT region, COUNT(*) AS customer_count FROM customers GROUP BY region ORDER BY customer_count DESC",
                        "reasoning": {
                            "intent": "Count the number of customers in each geographic region for distribution analysis",
                            "tables_used": [
                                {"name": "customers", "reason": "Contains region field and one row per customer for counting"}
                            ],
                            "columns_selected": [
                                {"name": "region", "reason": "Geographic dimension for grouping"},
                                {"name": "COUNT(*) AS customer_count", "reason": "Total number of customers per region"}
                            ],
                            "filters": [],
                            "joins": [],
                            "aggregations": [
                                {"function": "COUNT", "column": "*", "alias": "customer_count", "reason": "Count all customer records within each region group"}
                            ],
                            "sorting": [
                                {"column": "customer_count", "direction": "DESC", "reason": "Regions with most customers shown first"}
                            ],
                            "assumptions": ["Counting all registered customers regardless of order history"]
                        }
                    })
                return json.dumps({
                    "sql": "SELECT COUNT(*) AS total_customers FROM customers",
                    "reasoning": {
                        "intent": "Get the total number of registered customers in the system",
                        "tables_used": [
                            {"name": "customers", "reason": "Each row represents one customer; counting rows gives the total"}
                        ],
                        "columns_selected": [
                            {"name": "COUNT(*) AS total_customers", "reason": "Simple row count of the customers table"}
                        ],
                        "filters": [],
                        "joins": [],
                        "aggregations": [
                            {"function": "COUNT", "column": "*", "alias": "total_customers", "reason": "Count all rows in the customers table"}
                        ],
                        "sorting": [],
                        "assumptions": []
                    }
                })
            if "order" in user_query:
                return json.dumps({
                    "sql": "SELECT status, COUNT(*) AS order_count FROM orders GROUP BY status ORDER BY order_count DESC",
                    "reasoning": {
                        "intent": "Break down orders by their fulfillment status to understand pipeline distribution",
                        "tables_used": [
                            {"name": "orders", "reason": "Contains the status field and one row per order"}
                        ],
                        "columns_selected": [
                            {"name": "status", "reason": "Order fulfillment status (completed, shipped, pending, cancelled)"},
                            {"name": "COUNT(*) AS order_count", "reason": "Number of orders in each status category"}
                        ],
                        "filters": [],
                        "joins": [],
                        "aggregations": [
                            {"function": "COUNT", "column": "*", "alias": "order_count", "reason": "Count orders within each status group"}
                        ],
                        "sorting": [
                            {"column": "order_count", "direction": "DESC", "reason": "Most common status shown first"}
                        ],
                        "assumptions": ["Grouping by status for a useful breakdown"]
                    }
                })
            if "product" in user_query:
                return json.dumps({
                    "sql": "SELECT category, COUNT(*) AS product_count FROM products GROUP BY category ORDER BY product_count DESC",
                    "reasoning": {
                        "intent": "Count products in each category to understand catalog distribution",
                        "tables_used": [
                            {"name": "products", "reason": "Contains category and one row per product"}
                        ],
                        "columns_selected": [
                            {"name": "category", "reason": "Product category grouping dimension"},
                            {"name": "COUNT(*) AS product_count", "reason": "Number of products per category"}
                        ],
                        "filters": [],
                        "joins": [],
                        "aggregations": [
                            {"function": "COUNT", "column": "*", "alias": "product_count", "reason": "Count products within each category"}
                        ],
                        "sorting": [
                            {"column": "product_count", "direction": "DESC", "reason": "Largest categories first"}
                        ],
                        "assumptions": ["Grouping by category"]
                    }
                })

        # ── Pattern: Top / best / highest ──
        if any(kw in user_query for kw in ["top", "best", "highest", "most"]):
            num_match = re.search(r'(\d+)', user_query)
            limit = int(num_match.group(1)) if num_match else 5

            if "customer" in user_query:
                return json.dumps({
                    "sql": f"SELECT c.name, COUNT(o.id) AS order_count, SUM(o.total_amount) AS total_spent FROM customers c JOIN orders o ON c.id = o.customer_id WHERE o.status = 'completed' GROUP BY c.id, c.name ORDER BY total_spent DESC LIMIT {limit}",
                    "reasoning": {
                        "intent": f"Identify the top {limit} highest-spending customers based on completed order totals",
                        "tables_used": [
                            {"name": "customers", "reason": "Contains customer name and ID for identification"},
                            {"name": "orders", "reason": "Contains order totals and status to calculate each customer's spending"}
                        ],
                        "columns_selected": [
                            {"name": "c.name", "reason": "Customer name for identification"},
                            {"name": "COUNT(o.id) AS order_count", "reason": "Number of completed orders — shows purchase frequency"},
                            {"name": "SUM(o.total_amount) AS total_spent", "reason": "Total amount spent — the primary ranking metric"}
                        ],
                        "filters": [
                            {"condition": "o.status = 'completed'", "reason": "Only completed orders represent actual spending"}
                        ],
                        "joins": [
                            {"tables": "customers → orders", "condition": "c.id = o.customer_id", "type": "INNER JOIN", "reason": "Link customers to their orders via the customer_id foreign key"}
                        ],
                        "aggregations": [
                            {"function": "COUNT", "column": "o.id", "alias": "order_count", "reason": "Count completed orders per customer"},
                            {"function": "SUM", "column": "o.total_amount", "alias": "total_spent", "reason": "Sum all completed order amounts per customer"}
                        ],
                        "sorting": [
                            {"column": "total_spent", "direction": "DESC", "reason": "Highest spenders ranked first"}
                        ],
                        "assumptions": ["Ranking by total spending", "Only counting completed orders"]
                    }
                })
            if "product" in user_query:
                return json.dumps({
                    "sql": f"SELECT p.name, p.category, SUM(oi.quantity) AS total_sold, SUM(oi.quantity * oi.unit_price) AS total_revenue FROM products p JOIN order_items oi ON p.id = oi.product_id JOIN orders o ON oi.order_id = o.id WHERE o.status = 'completed' GROUP BY p.id, p.name, p.category ORDER BY total_sold DESC LIMIT {limit}",
                    "reasoning": {
                        "intent": f"Find the top {limit} best-selling products by total units sold from completed orders",
                        "tables_used": [
                            {"name": "products", "reason": "Contains product name and category for identification"},
                            {"name": "order_items", "reason": "Contains quantity and unit_price for each product sale"},
                            {"name": "orders", "reason": "Used to filter for completed orders only"}
                        ],
                        "columns_selected": [
                            {"name": "p.name", "reason": "Product name"},
                            {"name": "p.category", "reason": "Product category for additional context"},
                            {"name": "SUM(oi.quantity) AS total_sold", "reason": "Total units sold — the primary ranking metric"},
                            {"name": "SUM(oi.quantity * oi.unit_price) AS total_revenue", "reason": "Total revenue generated by this product"}
                        ],
                        "filters": [
                            {"condition": "o.status = 'completed'", "reason": "Only completed orders count as actual sales"}
                        ],
                        "joins": [
                            {"tables": "products → order_items", "condition": "p.id = oi.product_id", "type": "INNER JOIN", "reason": "Link products to their sales records via product_id"},
                            {"tables": "order_items → orders", "condition": "oi.order_id = o.id", "type": "INNER JOIN", "reason": "Link to orders to filter by completion status"}
                        ],
                        "aggregations": [
                            {"function": "SUM", "column": "oi.quantity", "alias": "total_sold", "reason": "Total quantity of this product sold"},
                            {"function": "SUM", "column": "oi.quantity * oi.unit_price", "alias": "total_revenue", "reason": "Revenue contribution of this product"}
                        ],
                        "sorting": [
                            {"column": "total_sold", "direction": "DESC", "reason": "Products with highest sales volume listed first"}
                        ],
                        "assumptions": ["Ranking by quantity sold", "Only counting completed orders"]
                    }
                })

        # ── Pattern: Average ──
        if any(kw in user_query for kw in ["average", "avg", "mean"]):
            if "order" in user_query or "price" in user_query or "amount" in user_query:
                return json.dumps({
                    "sql": "SELECT ROUND(AVG(total_amount), 2) AS average_order_value FROM orders WHERE status = 'completed'",
                    "reasoning": {
                        "intent": "Calculate the average monetary value of completed orders",
                        "tables_used": [
                            {"name": "orders", "reason": "Contains total_amount for each order"}
                        ],
                        "columns_selected": [
                            {"name": "ROUND(AVG(total_amount), 2) AS average_order_value", "reason": "Mean order value rounded to 2 decimal places for currency precision"}
                        ],
                        "filters": [
                            {"condition": "status = 'completed'", "reason": "Only completed orders represent realized transactions"}
                        ],
                        "joins": [],
                        "aggregations": [
                            {"function": "AVG", "column": "total_amount", "alias": "average_order_value", "reason": "Calculate the arithmetic mean of all completed order amounts"},
                            {"function": "ROUND", "column": "AVG(total_amount)", "alias": "average_order_value", "reason": "Round to 2 decimal places for proper currency formatting"}
                        ],
                        "sorting": [],
                        "assumptions": ["Only completed orders", "Rounded to 2 decimal places"]
                    }
                })

        # ── Pattern: Recent / latest ──
        if any(kw in user_query for kw in ["recent", "latest", "last", "newest"]):
            num_match = re.search(r'(\d+)', user_query)
            limit = int(num_match.group(1)) if num_match else 10
            return json.dumps({
                "sql": f"SELECT o.id, c.name AS customer_name, o.order_date, o.total_amount, o.status FROM orders o JOIN customers c ON o.customer_id = c.id ORDER BY o.order_date DESC LIMIT {limit}",
                "reasoning": {
                    "intent": f"Retrieve the {limit} most recent orders with customer details",
                    "tables_used": [
                        {"name": "orders", "reason": "Contains order date, amount, and status"},
                        {"name": "customers", "reason": "Joined to show customer name instead of raw ID"}
                    ],
                    "columns_selected": [
                        {"name": "o.id", "reason": "Order identifier"},
                        {"name": "c.name AS customer_name", "reason": "Human-readable customer name"},
                        {"name": "o.order_date", "reason": "Date of the order — used for sorting"},
                        {"name": "o.total_amount", "reason": "Monetary value of the order"},
                        {"name": "o.status", "reason": "Current fulfillment status"}
                    ],
                    "filters": [],
                    "joins": [
                        {"tables": "orders → customers", "condition": "o.customer_id = c.id", "type": "INNER JOIN", "reason": "Resolve customer_id to readable name via foreign key"}
                    ],
                    "aggregations": [],
                    "sorting": [
                        {"column": "o.order_date", "direction": "DESC", "reason": "Most recent first"}
                    ],
                    "assumptions": [f"Returning top {limit} by date", "Including customer name"]
                }
            })

        # ── Pattern: Status-based ──
        for status in ["pending", "shipped", "completed", "cancelled"]:
            if status in user_query:
                return json.dumps({
                    "sql": f"SELECT o.id, c.name AS customer_name, o.order_date, o.total_amount FROM orders o JOIN customers c ON o.customer_id = c.id WHERE o.status = '{status}' ORDER BY o.order_date DESC",
                    "reasoning": {
                        "intent": f"List all orders with '{status}' status along with customer information",
                        "tables_used": [
                            {"name": "orders", "reason": "Contains order data and status field for filtering"},
                            {"name": "customers", "reason": "Provides customer name via customer_id foreign key"}
                        ],
                        "columns_selected": [
                            {"name": "o.id", "reason": "Order identifier"},
                            {"name": "c.name AS customer_name", "reason": "Customer name for readability"},
                            {"name": "o.order_date", "reason": "When the order was placed"},
                            {"name": "o.total_amount", "reason": "Order monetary value"}
                        ],
                        "filters": [
                            {"condition": f"o.status = '{status}'", "reason": f"Only show orders currently in '{status}' state"}
                        ],
                        "joins": [
                            {"tables": "orders → customers", "condition": "o.customer_id = c.id", "type": "INNER JOIN", "reason": "Resolve customer ID to name"}
                        ],
                        "aggregations": [],
                        "sorting": [
                            {"column": "o.order_date", "direction": "DESC", "reason": "Most recent orders first"}
                        ],
                        "assumptions": [f"Filtering by status = '{status}'"]
                    }
                })

        # ── Pattern: Low stock ──
        if any(kw in user_query for kw in ["low stock", "out of stock", "running low", "inventory"]):
            return json.dumps({
                "sql": "SELECT name, category, price, stock_qty FROM products WHERE stock_qty < 50 ORDER BY stock_qty ASC",
                "reasoning": {
                    "intent": "Identify products with low inventory levels that may need restocking",
                    "tables_used": [
                        {"name": "products", "reason": "Contains stock_qty field for inventory monitoring"}
                    ],
                    "columns_selected": [
                        {"name": "name", "reason": "Product name for identification"},
                        {"name": "category", "reason": "Product category for context"},
                        {"name": "price", "reason": "Unit price — relevant for restock cost estimation"},
                        {"name": "stock_qty", "reason": "Current inventory quantity — the key metric"}
                    ],
                    "filters": [
                        {"condition": "stock_qty < 50", "reason": "Threshold of 50 units defines 'low stock' — products below this may run out soon"}
                    ],
                    "joins": [],
                    "aggregations": [],
                    "sorting": [
                        {"column": "stock_qty", "direction": "ASC", "reason": "Lowest stock first — most urgent items at the top"}
                    ],
                    "assumptions": ["Using 50 units as the low stock threshold"]
                }
            })

        # ── Default: Generic select ──
        return json.dumps({
            "sql": "SELECT c.name, c.email, c.region, COUNT(o.id) AS total_orders, COALESCE(SUM(o.total_amount), 0) AS total_spent FROM customers c LEFT JOIN orders o ON c.id = o.customer_id GROUP BY c.id, c.name, c.email, c.region ORDER BY total_spent DESC LIMIT 20",
            "reasoning": {
                "intent": "Generate a comprehensive customer overview showing activity and spending since the query didn't match a specific pattern",
                "tables_used": [
                    {"name": "customers", "reason": "Primary entity — contains all customer information"},
                    {"name": "orders", "reason": "Joined to calculate order counts and spending per customer"}
                ],
                "columns_selected": [
                    {"name": "c.name", "reason": "Customer name"},
                    {"name": "c.email", "reason": "Contact email"},
                    {"name": "c.region", "reason": "Geographic region"},
                    {"name": "COUNT(o.id) AS total_orders", "reason": "Number of orders placed"},
                    {"name": "COALESCE(SUM(o.total_amount), 0) AS total_spent", "reason": "Total spending with COALESCE to show 0 for customers with no orders"}
                ],
                "filters": [],
                "joins": [
                    {"tables": "customers → orders", "condition": "c.id = o.customer_id", "type": "LEFT JOIN", "reason": "LEFT JOIN to include customers who have never placed an order (would be excluded with INNER JOIN)"}
                ],
                "aggregations": [
                    {"function": "COUNT", "column": "o.id", "alias": "total_orders", "reason": "Count orders per customer"},
                    {"function": "SUM", "column": "o.total_amount", "alias": "total_spent", "reason": "Total spending per customer"},
                    {"function": "COALESCE", "column": "SUM(o.total_amount)", "alias": "total_spent", "reason": "Replace NULL with 0 for customers with no orders"}
                ],
                "sorting": [
                    {"column": "total_spent", "direction": "DESC", "reason": "Highest spenders first"}
                ],
                "assumptions": ["Providing a general customer overview as the query didn't match specific patterns", "Using LEFT JOIN to include customers with no orders", "Limited to 20 rows"]
            }
        })

    def _mock_ambiguity_score(self, prompt_lower: str) -> str:
        """Score query ambiguity using pattern heuristics."""
        
        query_match = re.search(r'"(.+?)"', prompt_lower)
        query = query_match.group(1) if query_match else prompt_lower

        ambiguities = []
        score = 0.9

        if "revenue" in query:
            ambiguities.append("'revenue' could refer to orders.total_amount or the sum of order_items.quantity * unit_price")
            score -= 0.15
        if "recent" in query and not any(w in query for w in ["last week", "last month", "yesterday", "today"]):
            ambiguities.append("'recent' is not defined — could mean last week, last month, or last quarter")
            score -= 0.15
        if "top" in query and not re.search(r'\d+', query):
            ambiguities.append("'top' is not specified — how many results? Top 5? Top 10?")
            score -= 0.1
        if "best" in query:
            ambiguities.append("'best' is subjective — by quantity sold? by revenue? by rating?")
            score -= 0.2
        if "big" in query or "large" in query or "small" in query:
            ambiguities.append("Relative size terms need a specific threshold")
            score -= 0.15
        if "performance" in query:
            ambiguities.append("'performance' could mean sales volume, revenue, growth rate, or other metrics")
            score -= 0.2

        score = max(0.1, min(1.0, score))

        clarification = ""
        if ambiguities:
            clarification = f"Could you clarify: {ambiguities[0].split(' — ')[-1] if ' — ' in ambiguities[0] else ambiguities[0]}?"

        return json.dumps({
            "confidence_score": round(score, 2),
            "is_ambiguous": score < 0.7,
            "ambiguities": ambiguities,
            "clarification_question": clarification
        })

    def _mock_correction(self, prompt: str) -> str:
        """Apply simple rule-based SQL corrections."""
        
        sql_match = re.search(r'```sql\n(.+?)\n```', prompt, re.DOTALL)
        failed_sql = sql_match.group(1).strip() if sql_match else ""
        
        error_match = re.search(r'Error message:\n(.+?)(?:\n\n|\nPrevious)', prompt, re.DOTALL)
        error = error_match.group(1).strip() if error_match else ""

        corrected_sql = failed_sql
        fix = "Applied general SQL correction"

        if "no such column" in error.lower():
            col_match = re.search(r'no such column: (\w+\.)?(\w+)', error, re.IGNORECASE)
            if col_match:
                bad_col = col_match.group(2)
                fix = f"Fixed reference to non-existent column '{bad_col}'"
                corrected_sql = corrected_sql.replace(bad_col, "id")

        elif "no such table" in error.lower():
            fix = "Fixed table reference"
            
        elif "ambiguous column" in error.lower():
            fix = "Added table alias to disambiguate column reference"

        elif "syntax error" in error.lower():
            fix = "Fixed SQL syntax error"

        return json.dumps({
            "sql": corrected_sql,
            "explanation": f"The previous query failed because of: {error}. {fix}.",
            "fix_description": fix
        })

    @property
    def name(self) -> str:
        return "Mock (Demo Mode)"


def get_provider(provider_name: str, **kwargs) -> LLMProvider:
    """Factory function to create the appropriate LLM provider."""
    if provider_name == "openai":
        api_key = kwargs.get("api_key")
        if not api_key:
            raise ValueError("OPENAI_API_KEY is required for OpenAI provider")
        model = kwargs.get("model", "gpt-4o")
        return OpenAIProvider(api_key=api_key, model=model)

    elif provider_name == "anthropic":
        api_key = kwargs.get("api_key")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY is required for Anthropic provider")
        model = kwargs.get("model", "claude-3-5-sonnet-20241022")
        return AnthropicProvider(api_key=api_key, model=model)

    elif provider_name == "groq":
        api_key = kwargs.get("api_key")
        if not api_key:
            raise ValueError("GROQ_API_KEY is required for Groq provider")
        model = kwargs.get("model", "llama3-8b-8192")
        return GroqProvider(api_key=api_key, model=model)

    elif provider_name == "mock":
        return MockProvider()

    else:
        raise ValueError(f"Unknown LLM provider: {provider_name}. Use 'openai', 'anthropic', 'groq', or 'mock'.")
