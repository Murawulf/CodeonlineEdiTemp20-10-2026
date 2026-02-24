const http = require('http');

const req = http.request({
  host: '91.134.35.126',
  port: 5001,
  path: '/api/orders/sent',
  method: 'GET',
  headers: {
    'x-api-pin': '3311',
    'x-entite-id': '4162'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('API sent orders count:', json.orders ? json.orders.length : 0);
      if (json.orders && json.orders.length > 0) {
        console.log('Sample order:', json.orders[0].num_commande, json.orders[0].created_at);
      }
    } catch(e) { console.log('Parse error:', e, data); }
  });
});
req.on('error', e => console.error(e));
req.end();
