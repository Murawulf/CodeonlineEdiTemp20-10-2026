const mysql = require('mysql');
const dbConfig = {
    host: 'localhost',
    user: 'consultant_seg',
    password: '49BD&4vyrK6=PT!',
    database: 'Dev_Entitedb'
};

const conn = mysql.createConnection(dbConfig);
conn.query("SELECT created_at, NOW() as now FROM orders WHERE num_commande = 'HAK99036'", (err, rows) => {
  console.log('mysql driver result:', rows[0].created_at.toISOString());
  conn.end();
});
