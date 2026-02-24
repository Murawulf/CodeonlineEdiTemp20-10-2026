const http = require('http');
console.log('Local Node TZ offset:', new Date().getTimezoneOffset());
const req = http.request({
  host: '91.134.35.126',
  port: 5001,
  path: '/api/orders/sent',
  method: 'GET',
  headers: {
    'x-api-pin': '3311',
    'x-entite-id': '111'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.orders && json.orders.length > 0) {
        const order = json.orders.find(o => o.num_commande === 'HAK99036');
        if (order) {
            console.log('HAK99036 date:', order.created_at);
            console.log('Parsed Local Date:', new Date(order.created_at).toString());
        }
      }
    } catch(e) { console.log('Parse error:', e, data); }
  });
});
req.on('error', e => console.error(e));
req.end();
