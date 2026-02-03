const fetch = require('node-fetch');

const API = 'https://investor-backend-3p3m.onrender.com/api';

async function test() {
  console.log('1. Testing login...');
  
  // Try to login
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@investor.sa',
      password: 'Admin123!'
    })
  });
  
  const loginData = await loginRes.json();
  console.log('Login response:', JSON.stringify(loginData, null, 2));
  
  if (!loginData.success || !loginData.data?.token) {
    console.log('❌ Login failed');
    return;
  }
  
  const token = loginData.data.token;
  console.log('\n✅ Got token:', token.substring(0, 50) + '...');
  
  console.log('\n2. Testing /api/stats/user with token...');
  const userStatsRes = await fetch(`${API}/stats/user`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const userStats = await userStatsRes.json();
  console.log('User stats response:', JSON.stringify(userStats, null, 2));
}

test().catch(console.error);
