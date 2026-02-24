const http = require('http');

const req = http.request({
  host: '91.134.35.126',
  port: 5001,
  path: '/api/orders/sent',
  method: 'GET',
  headers: {
    'x-api-pin': '3311',
    'x-entite-id': '4162' // ID de Senico
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.orders && json.orders.length > 0) {
        const order = json.orders.find(o => o.num_commande === 'HAK99036');
        console.log('API Output for HAK99036:');
        console.log(order);
      } else {
        console.log('No orders or error:', json);
      }
    } catch(e) { console.log('Parse error:', e, data); }
  });
});
req.on('error', e => console.error(e));
req.end();
