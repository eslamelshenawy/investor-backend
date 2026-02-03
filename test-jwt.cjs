const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
require('dotenv').config();

const API = 'https://investor-backend-3p3m.onrender.com/api';

async function test() {
  // Create a valid JWT token
  const token = jwt.sign(
    {
      userId: 'admin001',
      email: 'admin@investor-radar.com',
      role: 'ADMIN'
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  console.log('Generated token:', token.substring(0, 50) + '...');
  
  console.log('\nTesting /api/stats/user with token...');
  const res = await fetch(`${API}/stats/user`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await res.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

test().catch(console.error);
