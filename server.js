require('dotenv').config(); 
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path'); 
const axios = require('axios'); // ✅ อย่าลืม npm install axios นะครับ

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

// ทำให้โฟลเดอร์ public และ uploads เข้าถึงได้
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
app.get('/', (req, res) => {
    // เลือกไฟล์ที่คุณต้องการให้เป็นหน้าแรก (เช่น welcome.html หรือ login.html)
    res.sendFile(path.join(__dirname, 'public', 'welcome.html')); 
});
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

db.connect((err) => {
    if (err) {
        console.error('❌ Error connecting to Database:', err.message);
        return;
    }
    console.log('✅ Connected to MySQL Database (Aiven)!');
});

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // 587 ต้องเป็น false
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // บังคับ IPv4 แบบเด็ดขาด
    family: 4, 
    tls: {
        // ช่วยเรื่องความปลอดภัยและการเชื่อมต่อจาก Server นอก
        ciphers: 'SSLv3',
        rejectUnauthorized: false
    }
});
let otpStore = {};
let tempUserData = {};

// --- 🌟 ส่วนที่เพิ่มใหม่: เชื่อมต่อ Python AI ---
app.post('/api/analyze-mood', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ message: "กรุณาระบุข้อความ" });

        // ยิงไปหา Python Flask ที่พอร์ต 5001 (Internal)
        const aiResponse = await axios.post('http://127.0.0.1:5001/predict', { text: text });

        res.json({ 
            status: "Success", 
            mood: aiResponse.data.mood, 
            confidence: aiResponse.data.confidence 
        });
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ status: "Error", message: "AI ไม่ตอบสนอง (เช็คว่า app.py รันอยู่ที่พอร์ต 5001 หรือยัง)" });
    }
});

// --- 1. ระบบสมัครสมาชิกและ OTP ---
app.post('/register-step1', async (req, res) => {
    const { username, email, password } = req.body;
    console.log(`📩 กำลังพยายามส่ง OTP ไปที่: ${email}`); // ใส่ไว้ดูใน Log

    if (!username || !email || !password) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบถ้วน" });

    const checkSql = "SELECT * FROM users WHERE email = ? OR username = ?";
    db.query(checkSql, [email, username], async (err, results) => {
        if (err) {
            console.error("❌ Database Error:", err);
            return res.status(500).json({ message: "เกิดข้อผิดพลาดที่ฐานข้อมูล" });
        }
        if (results && results.length > 0) return res.status(400).json({ message: "Username หรือ Email นี้ถูกใช้งานแล้ว" });

        const otp = Math.floor(100000 + Math.random() * 900000);
        otpStore[email] = otp;
        tempUserData[email] = { username, email, password };

        const mailOptions = { 
            from: `"Mood Diary Support" <${process.env.EMAIL_USER}>`, 
            to: email, 
            subject: 'ยืนยันรหัส OTP สำหรับสมัครสมาชิก', 
            html: `<h2>รหัส OTP คือ: <span style="color: #f1c443;">${otp}</span></h2><p>รหัสนี้จะหมดอายุภายใน 5 นาที</p>` 
        };

        try { 
            await transporter.sendMail(mailOptions); 
            console.log("✅ ส่งอีเมลสำเร็จ!"); 
            res.json({ message: "ส่ง OTP เรียบร้อยแล้ว" }); 
        } 
        catch (error) { 
            console.error("❌ Nodemailer Error:", error); // บรรทัดนี้จะทำให้โชว์ใน Deploy Logs ชัวร์ๆ!
            res.status(500).json({ message: "ไม่สามารถส่งอีเมลได้", detail: error.message }); 
        }
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

app.post('/verify-reset-otp', (req, res) => {
    const { email, otp } = req.body;
    if (otpStore[email] && otpStore[email] == otp) {
        res.json({ message: "รหัส OTP ถูกต้อง" });
    } else {
        res.status(400).json({ message: "รหัส OTP ไม่ถูกต้องหรือหมดอายุแล้ว" });
    }
});

// --- 2. ระบบ Login และ Password ---
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ message: "Database error" });
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
app.get('/api/diary-months/:userId', (req, res) => {
    const userId = req.params.userId.toString().split(':')[0];
    const sql = `SELECT DISTINCT MONTH(entry_date) AS month_num, YEAR(entry_date) AS year_num FROM mood_entries WHERE user_id = ? ORDER BY year_num DESC, month_num DESC`;
    db.query(sql, [userId], (err, results) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", data: results });
    });
});

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

app.post('/api/save-diary', (req, res) => {
    const { user_id, date, text, mood, emoji, is_analyzed } = req.body;
    const cleanUserId = user_id.toString().split(':')[0];
    const sql = `INSERT INTO mood_entries (user_id, entry_date, entry_text, predicted_mood, is_analyzed, selected_emoji) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(sql, [cleanUserId, date, text, mood, is_analyzed || 0, emoji], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success", message: "บันทึกเรียบร้อยแล้ว", id: result.insertId });
    });
});

app.put('/api/update-diary/:id', (req, res) => {
    const diaryId = req.params.id.toString().split(':')[0];
    const { text, mood, emoji, date } = req.body;
    const sql = `UPDATE mood_entries SET entry_text = ?, predicted_mood = ?, selected_emoji = ?, entry_date = ? WHERE id = ?`;
    db.query(sql, [text, mood, emoji, date, diaryId], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success" });
    });
});

app.delete('/api/delete-diary/:id', (req, res) => {
    const diaryId = req.params.id.toString().split(':')[0];
    const sql = `DELETE FROM mood_entries WHERE id = ?`;
    db.query(sql, [diaryId], (err, result) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        res.json({ status: "Success" });
    });
});

app.get('/api/overview/:userId', (req, res) => {
    const { userId } = req.params;
    const { month, year } = req.query;
    const statsSql = `SELECT predicted_mood as mood, COUNT(*) as count FROM mood_entries WHERE user_id = ? AND MONTH(entry_date) = ? AND YEAR(entry_date) = ? GROUP BY predicted_mood`;
    const timelineSql = `SELECT DAY(entry_date) as day, predicted_mood FROM mood_entries WHERE user_id = ? AND MONTH(entry_date) = ? AND YEAR(entry_date) = ? ORDER BY entry_date ASC`;

    db.query(statsSql, [userId, month, year], (err, statsResults) => {
        if (err) return res.status(500).json({ status: "Error", message: err.message });
        db.query(timelineSql, [userId, month, year], (err, timelineResults) => {
            if (err) return res.status(500).json({ status: "Error", message: err.message });
            const moodScores = { 'มีความสุข': 5, 'มีความรัก': 5, 'โอเคดี': 3, 'กังวล': 2, 'เศร้า': 1, 'โกรธ': 1 };
            const timeline = timelineResults.map(t => ({ day: t.day, score: moodScores[t.predicted_mood] || 3 }));
            res.json({ status: "Success", data: { stats: statsResults, timeline: timeline } });
        });
    });
});

// --- [FIXED] ตั้งค่า Port ให้รองรับ Railway ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Node.js Server is running on port ${PORT}`);
});