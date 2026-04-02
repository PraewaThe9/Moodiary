const mysql = require('mysql2');

// สร้างการเชื่อมต่อโดยดึงค่าจาก Environment Variables ของ Railway
const connection = mysql.createConnection({
  // เปลี่ยนชื่อให้ตรงกับหน้า Variables ใน Railway
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'mood_diary', // ในรูป Railway ใช้ DB_NAME
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