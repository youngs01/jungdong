#!/usr/bin/env node
// simple CLI to exercise /login endpoint and show response
// usage: node login-test.js http://localhost:3000 userId password

const fetch = require('node-fetch');
const [,, apiUrl, userId, password] = process.argv;
if (!apiUrl || !userId || !password) {
  console.error('Usage: node login-test.js <apiUrl> <userId> <password>');
  process.exit(1);
}

(async () => {
  try {
    const res = await fetch(`${apiUrl.replace(/\/$$/, '')}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password }),
    });
    const data = await res.text();
    console.log('Status:', res.status);
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
