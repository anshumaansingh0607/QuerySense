"""
QuerySense — Sample Database Generator
Creates a realistic sales_db with customers, orders, products, and order_items.
"""

import sqlite3
import random
import os
from datetime import datetime, timedelta


def create_sample_database(db_path: str) -> None:
    """Create and populate the demo sales database. Idempotent."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # ── Create Tables ──
    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS customers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            region TEXT NOT NULL,
            signup_date DATE NOT NULL
        );

        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            stock_qty INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER NOT NULL,
            order_date DATE NOT NULL,
            total_amount REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY (customer_id) REFERENCES customers(id)
        );

        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity INTEGER NOT NULL,
            unit_price REAL NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        );
    """)

    # Check if data already exists
    cursor.execute("SELECT COUNT(*) FROM customers")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # ── Seed Data ──
    random.seed(42)

    # Regions
    regions = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East"]

    # Customers (30)
    first_names = ["Alice", "Bob", "Charlie", "Diana", "Ethan", "Fiona", "George", 
                   "Hannah", "Ivan", "Julia", "Kevin", "Laura", "Mike", "Nina",
                   "Oscar", "Paula", "Quinn", "Rachel", "Sam", "Tina",
                   "Uma", "Victor", "Wendy", "Xavier", "Yuki", "Zara",
                   "Aiden", "Bella", "Carlos", "Deepa"]
    last_names = ["Smith", "Johnson", "Chen", "Garcia", "Kim", "Patel", "Brown",
                  "Wilson", "Lee", "Taylor", "Anderson", "Thomas", "Martinez",
                  "Robinson", "Clark", "Lewis", "Walker", "Young", "Hall", "Allen",
                  "Wright", "King", "Scott", "Green", "Adams", "Nelson",
                  "Hill", "Moore", "White", "Harris"]

    customers = []
    for i, (first, last) in enumerate(zip(first_names, last_names)):
        name = f"{first} {last}"
        email = f"{first.lower()}.{last.lower()}@example.com"
        region = regions[i % len(regions)]
        signup = datetime(2023, 1, 1) + timedelta(days=random.randint(0, 700))
        customers.append((name, email, region, signup.strftime("%Y-%m-%d")))

    cursor.executemany(
        "INSERT INTO customers (name, email, region, signup_date) VALUES (?, ?, ?, ?)",
        customers
    )

    # Products (20)
    products_data = [
        ("Laptop Pro 15", "Electronics", 1299.99, 45),
        ("Wireless Mouse", "Electronics", 29.99, 200),
        ("USB-C Hub", "Electronics", 49.99, 150),
        ("Mechanical Keyboard", "Electronics", 89.99, 120),
        ("4K Monitor", "Electronics", 449.99, 60),
        ("Standing Desk", "Furniture", 599.99, 30),
        ("Ergonomic Chair", "Furniture", 399.99, 50),
        ("Desk Lamp", "Furniture", 39.99, 180),
        ("Bookshelf", "Furniture", 149.99, 40),
        ("Filing Cabinet", "Furniture", 119.99, 35),
        ("Notebook Pack", "Office Supplies", 12.99, 500),
        ("Pen Set", "Office Supplies", 8.99, 600),
        ("Whiteboard", "Office Supplies", 79.99, 75),
        ("Sticky Notes", "Office Supplies", 4.99, 800),
        ("Printer Paper", "Office Supplies", 24.99, 300),
        ("Webcam HD", "Electronics", 69.99, 90),
        ("Headphones", "Electronics", 159.99, 100),
        ("Cable Organizer", "Office Supplies", 14.99, 250),
        ("Monitor Arm", "Furniture", 89.99, 65),
        ("Desk Mat", "Office Supplies", 19.99, 175),
    ]

    cursor.executemany(
        "INSERT INTO products (name, category, price, stock_qty) VALUES (?, ?, ?, ?)",
        products_data
    )

    # Orders and Order Items (80 orders)
    statuses = ["completed", "completed", "completed", "completed", "shipped", "shipped", "pending", "cancelled"]
    
    for order_id in range(1, 81):
        customer_id = random.randint(1, 30)
        order_date = datetime(2024, 1, 1) + timedelta(days=random.randint(0, 460))
        status = random.choice(statuses)

        # 1-4 items per order
        num_items = random.randint(1, 4)
        chosen_products = random.sample(range(1, 21), num_items)
        total = 0.0
        items = []

        for prod_id in chosen_products:
            qty = random.randint(1, 5)
            price = products_data[prod_id - 1][2]
            total += qty * price
            items.append((order_id, prod_id, qty, price))

        cursor.execute(
            "INSERT INTO orders (customer_id, order_date, total_amount, status) VALUES (?, ?, ?, ?)",
            (customer_id, order_date.strftime("%Y-%m-%d"), round(total, 2), status)
        )

        cursor.executemany(
            "INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
            items
        )

    conn.commit()
    conn.close()


def simulate_schema_drift(db_path: str) -> dict:
    """
    Simulate a schema change for demo purposes.
    Adds a 'discount' column to orders and renames nothing (SQLite doesn't support RENAME COLUMN easily).
    Returns a description of changes made.
    """
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    changes = []

    # Check if discount column already exists
    cursor.execute("PRAGMA table_info(orders)")
    columns = [col[1] for col in cursor.fetchall()]

    if "discount" not in columns:
        cursor.execute("ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0.0")
        # Set some random discounts
        cursor.execute("UPDATE orders SET discount = ROUND(ABS(RANDOM() % 20), 2) WHERE id % 3 = 0")
        changes.append("Added column 'orders.discount' (REAL)")

    # Add a loyalty_tier column to customers if not exists
    cursor.execute("PRAGMA table_info(customers)")
    columns = [col[1] for col in cursor.fetchall()]

    if "loyalty_tier" not in columns:
        cursor.execute("ALTER TABLE customers ADD COLUMN loyalty_tier TEXT DEFAULT 'bronze'")
        cursor.execute("UPDATE customers SET loyalty_tier = 'gold' WHERE id % 5 = 0")
        cursor.execute("UPDATE customers SET loyalty_tier = 'silver' WHERE id % 3 = 0 AND loyalty_tier = 'bronze'")
        changes.append("Added column 'customers.loyalty_tier' (TEXT)")

    conn.commit()
    conn.close()

    return {"changes": changes, "applied": len(changes) > 0}
