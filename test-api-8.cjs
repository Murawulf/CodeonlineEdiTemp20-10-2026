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
        if (order) {
            console.log('HAK99036 date_commande:', order.date_commande);
            console.log('HAK99036 created_at:', order.created_at);
        }
      }
    } catch(e) {}
  });
});
req.on('error', e => {});
req.end();
