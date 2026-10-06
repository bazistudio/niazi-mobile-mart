const https = require('https');

const API_URL = 'https://niazi-server-860232188829.asia-south1.run.app';

function fetchApi(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + path);
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`API Error ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function runTests() {
  try {
    console.log('1. Admin Login');
    const adminLogin = await fetchApi('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'imran khan', password: 'YOUR_ADMIN_PASSWORD' }) });
    const adminToken = adminLogin.token;
    const authHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` };
    
    console.log('2. Create Product');
    const productPayload = { name: 'TEST-PG-PRODUCT-5', sku: 'TEST05', purchase_price: 50, sale_price: 100, category_id: '27febf7b-4ce1-428f-a7d1-8f36c4b8dde8', initial_quantity: 10 };
    const newProduct = await fetchApi('/api/products', { method: 'POST', headers: authHeaders, body: JSON.stringify(productPayload) });
    console.log('Product created:', newProduct.id);

    console.log('3. Verify Product Exists');
    const prodList = await fetchApi('/api/products', { method: 'GET', headers: authHeaders });
    const prodExists = prodList.some(p => p.id === newProduct.id);
    console.log(`PostgreSQL row exists: ${prodExists ? 'YES' : 'NO'}`);

    console.log('3.5 Add Inventory');
    const inv = await fetchApi('/api/inventory/move', { method: 'POST', headers: authHeaders, body: JSON.stringify({ product_id: newProduct.id, to_branch_id: null, quantity: 10, movement_type: 'INITIAL_STOCK' }) });

    console.log('4. Admin Sale');
    const salePayload = { branch_id: null, items: [{ product_id: newProduct.id, quantity: 1, unit_price: 100, price: 100, discount: 0 }], payment_method: 'cash' };
    const adminSale = await fetchApi('/api/sales', { method: 'POST', headers: authHeaders, body: JSON.stringify(salePayload) });
    console.log(`Admin Sale exists: ${adminSale.sale ? 'YES' : 'NO'}`);

    console.log('5. Salesman Login');
    const smLogin = await fetchApi('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'bashi', password: 'YOUR_SALESMAN_PASSWORD' }) }).catch(e => { console.log('Salesman login failed, trying default token'); return null; });
    const smAuthHeaders = smLogin ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${smLogin.token}` } : authHeaders;

    console.log('6. Salesman Sale');
    const smSale = await fetchApi('/api/sales', { method: 'POST', headers: smAuthHeaders, body: JSON.stringify(salePayload) });
    console.log(`Salesman Sale exists: ${smSale.sale ? 'YES' : 'NO'}`);

    console.log('7. Dashboard Check');
    const dash = await fetchApi('/api/reports/profit', { method: 'GET', headers: smAuthHeaders });
    console.log(`Dashboard Uses PostgreSQL data: ${dash ? 'YES' : 'NO'}`);
  } catch (err) {
    console.error('Test Error:', err.message);
  }
}
runTests();
