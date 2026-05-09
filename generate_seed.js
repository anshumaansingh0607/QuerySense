const fs = require('fs');

// Utility for random data
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

// Configuration
const NUM_CUSTOMERS = 250;
const NUM_PRODUCTS = 60;
const NUM_ORDERS = 1000;
const NUM_ORDER_ITEMS = 3000;

// Regular Lists
const TIERS = ['bronze', 'silver', 'gold'];
const STATUSES = ['delivered', 'pending', 'cancelled', 'refunded', 'returned'];
const CATEGORIES = ['Electronics', 'Clothing', 'Home', 'Books', 'Toys', 'Sports'];

// Realistic Product Names
const PRODUCT_NAMES = {
    'Electronics': ['Quantum Neural Laptop', 'Echo Noise-Canceling Headphones', 'CineVision 4K Projector', 'Nebula Smartwatch', 'Aura VR Headset', 'CyberPad Air', 'Titanium Gaming Mouse', 'Stellar 8K Monitor', 'HyperDrive SSD 2TB', 'Mechanical Keyboard Pro'],
    'Clothing': ['Merino Wool Sweater', 'Classic Denim Jacket', 'Athletic Performance Tights', 'Vintage Leather Boots', 'Organic Cotton Tee', 'Silk Evening Gown', 'Urban Zip Hoodie', 'Waterproof Trench Coat', 'Comfort-Fit Joggers', 'Arctic Winter Parka'],
    'Home': ['Ergonomic Desk Chair', 'Ceramic Vases Set', 'Memory Foam Mattress', 'Modernist Coffee Table', 'Smart LED Bulb', 'Stainless Steel Cookware', 'Bamboo Bath Towels', 'Minimalist Floor Lamp', 'Artisan Coffee Maker', 'Velvet Throw Pillows'],
    'Books': ['The Last Empire (Hardcover)', 'Quantum Computing Basics', 'Culinary Secrets of Italy', 'A Journey Through Time', 'Mastering SQL Systems', 'The Art of War', 'Design Patterns in JS', 'Cosmos Explorer', 'Financial Freedom 101', 'Architectural Wonders'],
    'Toys': ['Galactic Cruiser Lego Set', 'Robot Companion Rex', 'Classic Wooden Train', 'Interactive Puzzle Cube', 'Super Soaker Pro', 'Magic Sand Kit', 'Retro Arcade Mini', 'Hover Drone X1', 'Action Figure Heroes', 'Creative Arts Box'],
    'Sports': ['Pro-Grip Basketball', 'Carbon Fiber Tennis Racket', 'Aerodynamic Biking Helmet', 'Yoga Mat Premium', 'Adjustable Dumbbells', 'Surfing Wetsuit', 'Mountain Trail Bike', 'Golf Club Elite', 'Boxing Gloves 14oz', 'Track & Field Spikes']
};

// Realistic First & Last Names (Global/Indian Mix)
const FIRST_NAMES = ['Aarav', 'Vihaan', 'Aditya', 'Sai', 'Arjun', 'Amit', 'Rahul', 'Vikram', 'Rohit', 'Sanjay', 'Priya', 'Riya', 'Anjali', 'Pooja', 'Sneha', 'Neha', 'James', 'Michael', 'Robert', 'Sarah', 'Emma', 'Olivia', 'David', 'John', 'Ahmed', 'Fatima', 'Isabella', 'William', 'Sophia', 'Yousef', 'Maria', 'Chen', 'Li', 'Carlos', 'Luis', 'Ana', 'Elena'];
const LAST_NAMES = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Rao', 'Desai', 'Verma', 'Joshi', 'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris'];
const LOCATIONS = ['Mumbai, India', 'Delhi, India', 'Bangalore, India', 'New York, USA', 'London, UK', 'Toronto, Canada', 'Sydney, Australia', 'Berlin, Germany', 'Dubai, UAE', 'Tokyo, Japan', 'Paris, France', 'Sao Paulo, Brazil'];

const START_DATE = new Date();
START_DATE.setFullYear(START_DATE.getFullYear() - 1);
const END_DATE = new Date();

let sql = '';

// 1. PRODUCTS
const products = [];
sql += '-- Products\n';
sql += 'INSERT INTO products (id, name, category, price, stock_qty) VALUES\n';
for (let i = 1; i <= NUM_PRODUCTS; i++) {
    const category = randomChoice(CATEGORIES);
    const prodNameList = PRODUCT_NAMES[category];
    const name = randomChoice(prodNameList) + ' ' + randomChoice(['V1', 'V2', 'Pro', 'Max', 'Lite', 'Plus', 'Edition']);
    
    let price = 0;
    if (category === 'Electronics') price = randomInt(50, 1500) + 0.99;
    else if (category === 'Clothing') price = randomInt(15, 120) + 0.99;
    else if (category === 'Books') price = randomInt(10, 40) + 0.99;
    else price = randomInt(20, 300) + 0.99;
    
    const stock_qty = (Math.random() < 0.15) ? 0 : randomInt(5, 500); // Edge case: 15% out of stock
    
    products.push({ id: i, category, price });
    sql += `(${i}, '${name.replace(/'/g, "''")}', '${category}', ${price.toFixed(2)}, ${stock_qty})${i === NUM_PRODUCTS ? ';' : ','}\n`;
}
sql += '\n';

// 2. CUSTOMERS
sql += '-- Customers\n';
sql += 'INSERT INTO customers (id, name, email, region, signup_date, loyalty_tier) VALUES\n';
for (let i = 1; i <= NUM_CUSTOMERS; i++) {
    const tier = randomChoice(TIERS);
    const signup = randomDate(new Date(START_DATE.getTime() - 10000000000), END_DATE);
    
    const name = `${randomChoice(FIRST_NAMES)} ${randomChoice(LAST_NAMES)}`;
    const email = `${name.replace(' ', '.').toLowerCase()}${randomInt(1, 9999)}@example.com`;
    const location = randomChoice(LOCATIONS);
    
    sql += `(${i}, '${name.replace(/'/g, "''")}', '${email}', '${location}', '${signup.toISOString()}', '${tier}')${i === NUM_CUSTOMERS ? ';' : ','}\n`;
}
sql += '\n';

// Pre-calculate mapping
const orderItemCounts = new Array(NUM_ORDERS + 1).fill(1);
orderItemCounts[0] = 0;
for (let i = 0; i < NUM_ORDER_ITEMS - NUM_ORDERS; i++) {
    const randomOrderId = randomInt(1, NUM_ORDERS);
    orderItemCounts[randomOrderId]++;
}

let currentItemId = 1;
const ordersData = [];
const orderItemsSqlBlocks = [];

for (let orderId = 1; orderId <= NUM_ORDERS; orderId++) {
    let total_amount = 0;
    const numItems = orderItemCounts[orderId];
    
    for (let itemIdx = 0; itemIdx < numItems; itemIdx++) {
        // Edge case: Products 55-60 are never ordered!
        const product = products[randomInt(0, 54)]; 
        const quantity = randomInt(1, 5);
        const unit_price = product.price;
        total_amount += quantity * unit_price;
        
        orderItemsSqlBlocks.push(`(${currentItemId}, ${orderId}, ${product.id}, ${quantity}, ${unit_price.toFixed(2)})`);
        currentItemId++;
    }
    
    // Edge case: Customers 220-250 never place an order! (Zero queries)
    const customer_id = randomInt(1, 219); 
    const order_date = randomDate(START_DATE, END_DATE);
    
    // Edge cases for Status: Includes refunds/returns now
    let status = randomChoice(STATUSES);
    if (Math.random() < 0.05) status = 'refunded';
    
    let discountPct = randomInt(0, 30);
    // Edge case: Crazy 100% discount on a few orders!
    if (Math.random() < 0.02) discountPct = 100;
    
    const discount = (total_amount * (discountPct / 100));
    total_amount = total_amount - discount;
    if (total_amount < 0) total_amount = 0;
    
    // Edge case: Extreme "Whale" orders (Corporate B2B buys)
    if (Math.random() < 0.01) {
        total_amount += randomInt(10000, 50000); 
    }
    
    ordersData.push(`(${orderId}, ${customer_id}, '${order_date.toISOString()}', ${total_amount.toFixed(2)}, '${status}', ${discount.toFixed(2)})`);
}

// Write Orders SQL
sql += '-- Orders\n';
for (let i = 0; i < ordersData.length; i += 250) {
    const chunk = ordersData.slice(i, i + 250);
    sql += 'INSERT INTO orders (id, customer_id, order_date, total_amount, status, discount) VALUES\n';
    sql += chunk.join(',\n') + ';\n';
}
sql += '\n';

// Write Order Items SQL
sql += '-- Order Items\n';
for (let i = 0; i < orderItemsSqlBlocks.length; i += 500) {
    const chunk = orderItemsSqlBlocks.slice(i, i + 500);
    sql += 'INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES\n';
    sql += chunk.join(',\n') + ';\n';
}

fs.writeFileSync('seed_database.sql', sql);
console.log('Successfully generated perfect realistic seed_database.sql');
