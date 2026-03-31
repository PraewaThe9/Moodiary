const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path'); 

const app = express();

// --- ตั้งค่า Multer สำหรับอัปโหลดรูปภาพ ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'public/uploads/')); 
    },
    filename: (req, file, cb) => {
        cb(null, 'profile-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ทำให้โฟลเดอร์ uploads เข้าถึงได้ผ่าน URL
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456', 
    database: process.env.DB_NAME || 'mood_diary',
    port: process.env.DB_PORT || 3306,
    // เพิ่มบรรทัดนี้เพื่อให้เชื่อมต่อ Aiven ได้สำเร็จ
    ssl: {
        rejectUnauthorized: false
    }
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to Database:', err);
        return;
    }
    console.log('Connected to MySQL Database!');
});

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'praewa8045@gmail.com',
        pass: 'rywv gtst vaqx jkzo' 
    }
});

let otpStore = {};
let tempUserData = {};

// --- 1. ระบบสมัครสมาชิกและ OTP ---
app.post('/register-step1', async (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });
    const checkSql = "SELECT * FROM users WHERE email = ? OR username = ?";
    db.query(checkSql, [email, username], async (err, results) => {
        if (results && results.length > 0) return res.status(400).json({ message: "Username หรือ Email นี้ถูกใช้งานแล้ว" });
        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[email] = otp;
        tempUserData[email] = { username, email, password };
        setTimeout(() => { if (otpStore[email] === otp) { delete otpStore[email]; delete tempUserData[email]; } }, 300000);
        const mailOptions = { from: '"Mood Diary Support" <praewa8045@gmail.com>', to: email, subject: 'ยืนยันรหัส OTP สำหรับสมัครสมาชิก', html: `<h2>รหัส OTP คือ: ${otp}</h2>` };
        try { await transporter.sendMail(mailOptions); res.json({ message: "ส่ง OTP เรียบร้อยแล้ว" }); } 
        catch (error) { res.status(500).json({ message: "ไม่สามารถส่งอีเมลได้" }); }
    });
});

app.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;
    if (!otpStore[email] || otpStore[email] != otp) return res.status(400).json({ message: "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว" });
    const userData = tempUserData[email];
    try {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        db.query("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [userData.username, userData.email, hashedPassword], (err) => {
            if (err) return res.status(500).json({ message: "เกิดข้อผิดพลาดในการบันทึกข้อมูล" });
            delete otpStore[email]; delete tempUserData[email];
            res.json({ message: "สมัครสมาชิกสำเร็จ!" });
        });
    } catch (error) { res.status(500).json({ message: "Internal Server Error" }); }
});

// [ADD] เพิ่ม API สำหรับตรวจสอบ OTP โดยเฉพาะ (เพื่อแก้ Error 404)
app.post('/verify-reset-otp', (req, res) => {
    const { email, otp } = req.body;
    
    // ตรวจสอบว่ามี OTP ใน Store หรือไม่ และตรงกันไหม
    if (otpStore[email] && otpStore[email] == otp) {
        // ถ้าถูกต้อง ให้ตอบกลับสำเร็จ (แต่อย่าเพิ่งลบ OTP เพราะต้องใช้ในหน้า reset-password ต่อ)
        res.json({ message: "รหัส OTP ถูกต้อง" });
    } else {
        res.status(400).json({ message: "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว" });
    }
});
// --- 2. ระบบ Login และ Password ---
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (results.length === 0) return res.status(401).json({ message: "ไม่พบอีเมลในระบบ" });
        const isMatch = await bcrypt.compare(password, results[0].password);
        if (isMatch) res.json({ 
            message: "สำเร็จ", 
            userId: results[0].id, 
            username: results[0].username,
            email: results[0].email 
        });
        else res.status(401).json({ message: "รหัสผ่านผิด" });
    });
});

app.post('/forgot-password', (req, res) => {
    const { email } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (results.length === 0) return res.status(404).json({ message: "ไม่พบอีเมล" });
        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[email] = otp;
        setTimeout(() => { if (otpStore[email] === otp) delete otpStore[email]; }, 300000);
        try {
            await transporter.sendMail({ from: '"Mood Diary Support" <praewa8045@gmail.com>', to: email, subject: 'OTP รีเซ็ตรหัสผ่าน', html: `<h3>รหัสคือ: <b>${otp}</b></h3>` });
            res.json({ message: "ส่งรหัสแล้ว" });
        } catch (error) { res.status(500).json({ message: "ส่งเมลไม่สำเร็จ" }); }
    });
});

app.post('/reset-password', async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!otpStore[email] || otpStore[email] != otp) return res.status(400).json({ message: "OTP ไม่ถูกต้อง" });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    db.query("UPDATE users SET password = ? WHERE email = ?", [hashedPassword, email], (err) => {
        if (err) return res.status(500).json({ message: "ล้มเหลว" });
        delete otpStore[email];
        res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จแล้ว!" });
    });
});

// --- 3. ระบบ Profile ---
app.get('/api/user/:id', (req, res) => {
    const sql = "SELECT id, username, email, profile_image FROM users WHERE id = ?";
    db.query(sql, [req.params.id], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", user: result[0] });
    });
});

app.post('/api/update-profile', upload.single('profile_image'), (req, res) => {
    const { userId, username, email } = req.body;
    let sql = "UPDATE users SET username = ?, email = ? WHERE id = ?";
    let params = [username, email, userId];

    if (req.file) {
        sql = "UPDATE users SET username = ?, email = ?, profile_image = ? WHERE id = ?";
        params = [username, email, req.file.filename, userId];
    }

    db.query(sql, params, (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message }); 
        res.json({ status: "Success", message: "บันทึกเรียบร้อยแล้ว" });
    });
});

// --- 4. ระบบบันทึกไดอารี่/อารมณ์ ---

// [ADD] API สำหรับดึงรายการเดือนที่มีบันทึก (สำหรับ Filter แถบด้านข้าง)
app.get('/api/diary-months/:userId', (req, res) => {
    const userId = req.params.userId.toString().split(':')[0];
    
    const sql = `
        SELECT DISTINCT 
            DATE_FORMAT(entry_date, '%m') AS month_num,
            DATE_FORMAT(entry_date, '%Y') AS year_num
        FROM mood_entries 
        WHERE user_id = ? 
        ORDER BY year_num DESC, month_num DESC
    `;

    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", data: results });
    });
});

// [FIXED] เปลี่ยน Path จาก /api/mood_entries เป็น /api/diaries ให้ตรงกับ frontend
app.get('/api/diaries/:userId', (req, res) => {
    const userId = req.params.userId.toString().split(':')[0];
    const { month, year } = req.query; 
    
    let sql = "SELECT * FROM mood_entries WHERE user_id = ?";
    let params = [userId];

    if (month && year) {
        sql += " AND MONTH(entry_date) = ? AND YEAR(entry_date) = ?";
        params.push(month, year);
    }
    sql += " ORDER BY entry_date DESC";

    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", data: results });
    });
});

// [FIXED] ปรับปรุงการบันทึกใหม่
app.post('/api/save-diary', (req, res) => {
    const { user_id, date, text, mood, emoji, is_analyzed } = req.body;
    // ล้างค่า userId ป้องกันเครื่องหมาย :
    const cleanUserId = user_id.toString().split(':')[0];

    const sql = `
        INSERT INTO mood_entries 
        (user_id, entry_date, entry_text, predicted_mood, is_analyzed, selected_emoji) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(sql, [cleanUserId, date, text, mood, is_analyzed || 0, emoji], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", message: "บันทึกเรียบร้อยแล้ว", id: result.insertId });
    });
});

// [FIXED] ปรับปรุงการแก้ไขบันทึก
app.put('/api/update-diary/:id', (req, res) => {
    const diaryId = req.params.id.toString().split(':')[0];
    const { text, mood, emoji, date } = req.body;

    const sql = `UPDATE mood_entries SET entry_text = ?, predicted_mood = ?, selected_emoji = ?, entry_date = ? WHERE id = ?`;
    
    db.query(sql, [text, mood, emoji, date, diaryId], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success" });
    });
});

// [FIXED] ปรับปรุงการลบบันทึก
app.delete('/api/delete-diary/:id', (req, res) => {
    const diaryId = req.params.id.toString().split(':')[0];
    const sql = `DELETE FROM mood_entries WHERE id = ?`;
    db.query(sql, [diaryId], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success" });
    });
});

// ดึงข้อมูลสถิติอารมณ์รายเดือน
app.get('/api/overview/:userId', (req, res) => {
    const { userId } = req.params;
    const { month, year } = req.query;

    // 1. SQL สำหรับหาจำนวนอารมณ์แต่ละประเภท (สำหรับ Pie Chart)
    const statsSql = `
        SELECT predicted_mood as mood, COUNT(*) as count 
        FROM mood_entries 
        WHERE user_id = ? AND MONTH(entry_date) = ? AND YEAR(entry_date) = ?
        GROUP BY predicted_mood`;

    // 2. SQL สำหรับหาแนวโน้มอารมณ์รายวัน (สำหรับ Line Chart)
    // เราจะใช้คะแนนความสุขจำลองตามชื่ออารมณ์ (เช่น มีความสุข=5, เศร้า=1)
    const timelineSql = `
        SELECT DAY(entry_date) as day, predicted_mood 
        FROM mood_entries 
        WHERE user_id = ? AND MONTH(entry_date) = ? AND YEAR(entry_date) = ?
        ORDER BY entry_date ASC`;

    db.query(statsSql, [userId, month, year], (err, statsResults) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });

        db.query(timelineSql, [userId, month, year], (err, timelineResults) => {
            if (err) return res.status(500).json({ status: "Error", message: err.message });

            // แปลงอารมณ์เป็นคะแนน (1-5) เพื่อแสดงผลในกราฟเส้น
            const moodScores = { 'มีความสุข': 5, 'มีความรัก': 5, 'โอเคดี': 3, 'กังวล': 2, 'เศร้า': 1, 'โกรธ': 1 };
            const timeline = timelineResults.map(t => ({
                day: t.day,
                score: moodScores[t.predicted_mood] || 3
            }));

            res.json({
                status: "Success",
                data: {
                    stats: statsResults, // [ { mood: 'มีความสุข', count: 10 }, ... ]
                    timeline: timeline   // [ { day: 1, score: 5 }, ... ]
                }
            });
        });
    });
});

// ดึงรายการเดือนที่มีการบันทึกไว้ (สำหรับ Sidebar ขวา)
app.get('/api/diary-months/:userId', (req, res) => {
    const { userId } = req.params;
    const sql = `
        SELECT DISTINCT MONTH(entry_date) as month_num, YEAR(entry_date) as year_num
        FROM mood_entries
        WHERE user_id = ?
        ORDER BY year_num DESC, month_num DESC`;

    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", data: results });
    });
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});