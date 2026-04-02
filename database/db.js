const mysql = require('mysql2');

// สร้างการเชื่อมต่อโดยดึงค่าจาก Environment Variables ของ Railway
const connection = mysql.createConnection({
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '123456',
  database: process.env.MYSQLDATABASE || 'mood_diary',
  port: process.env.MYSQLPORT || 3306
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to Database:', err.message);
    return;
  }
  console.log('Connected to MySQL Database on Railway!');
});

module.exports = connection;