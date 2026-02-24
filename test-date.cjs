const mysql = require('mysql2/promise');
async function test() {
  const conn = await mysql.createConnection({
    host: '91.134.35.126',
    user: 'consultant_seg',
    password: '49BD&4vyrK6=PT!',
    database: 'Dev_Entitedb'
  });
  const [rows] = await conn.query("SELECT created_at FROM orders WHERE num_commande = 'HAK99036'");
  console.log('Row from DB:', rows[0].created_at);
  console.log('Type:', typeof rows[0].created_at);
  if (rows[0].created_at instanceof Date) {
    console.log('ISO:', rows[0].created_at.toISOString());
  }
  await conn.end();
}
test();
