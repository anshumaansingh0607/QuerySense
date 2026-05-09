const fs = require('fs');

const firstNames = ['Aarav', 'Vihaan', 'Aditya', 'Sai', 'Arjun', 'Amit', 'Rahul', 'Vikram', 'Rohit', 'Sanjay', 'Priya', 'Riya', 'Anjali', 'Pooja', 'Sneha', 'Neha', 'Kavya', 'Roshni', 'Swati', 'Megha', 'Kunal', 'Ravi', 'Suresh', 'Manish', 'Nitin', 'Shruti', 'Priyanka', 'Deepa', 'Divya', 'Ankita'];
const lastNames = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Reddy', 'Rao', 'Desai', 'Verma', 'Joshi', 'Das', 'Yadav', 'Bansal', 'Agarwal', 'Chauhan', 'Nair', 'Iyer', 'Menon', 'Bhattacharya', 'Mukherjee', 'Mishra', 'Pandey', 'Tiwari', 'Chopra', 'Jain'];
const locations = ['Mumbai, Maharashtra', 'Delhi, NCR', 'Bangalore, Karnataka', 'Hyderabad, Telangana', 'Chennai, Tamil Nadu', 'Kolkata, West Bengal', 'Pune, Maharashtra', 'Ahmedabad, Gujarat', 'Jaipur, Rajasthan', 'Surat, Gujarat', 'Lucknow, Uttar Pradesh', 'Chandigarh, Punjab'];
const tiers = ['bronze', 'silver', 'gold'];

const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

const START_DATE = new Date('2025-01-01T00:00:00Z');
const END_DATE = new Date('2026-04-20T00:00:00Z');

let sql = 'INSERT INTO customers (id, name, email, region, signup_date, loyalty_tier) VALUES\n';

const lines = [];
for (let i = 30; i <= 250; i++) {
    const name = `${randomChoice(firstNames)} ${randomChoice(lastNames)}`;
    const email = `${name.replace(' ', '.').toLowerCase()}${Math.floor(Math.random() * 999)}@example.com`;
    const location = randomChoice(locations);
    const tier = randomChoice(tiers);
    const signup = randomDate(START_DATE, END_DATE);
    
    lines.push(`(${i}, '${name}', '${email}', '${location}', '${signup.toISOString()}', '${tier}')`);
}

sql += lines.join(',\n') + ';\n';
fs.writeFileSync('indian_customers.sql', sql);
