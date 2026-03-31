const mysql = require('mysql2');

// สร้างการเชื่อมต่อ
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',      // ชื่อผู้ใช้ของ Database
  password: '123456',      // รหัสผ่าน (ถ้ามี)
  database: 'mood_diary' 
});

connection.connect((err) => {
  if (err) throw err;
  console.log('Connected to MySQL Database!');
});

module.exports = connection;