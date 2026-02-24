const mysql = require('mysql2/promise');
const dbConfig = {
    host: 'localhost',
    user: 'consultant_seg',
    password: '49BD&4vyrK6=PT!',
    database: 'Dev_Entitedb'
};

async function test() {
  const conn = await mysql.createConnection(dbConfig);
  const [rows] = await conn.query("SELECT created_at, NOW() as now FROM orders WHERE num_commande = 'HAK99036'");
  console.log('created_at string:', rows[0].created_at.toString());
  console.log('created_at ISO:', rows[0].created_at.toISOString());
  console.log('now ISO:', rows[0].now.toISOString());
  await conn.end();
}
test();
