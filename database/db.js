const mysql = require('mysql2');

// สร้างการเชื่อมต่อโดยดึงค่าจาก Environment Variables ของ Railway
const connection = mysql.createConnection({
  host: process.env.DB_HOST,     // ต้องตรงกับในหน้า Variables
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306
});
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to Database:', err.message);
    return;
  }
  console.log('Connected to MySQL Database on Railway!');
});

module.exports = connection;