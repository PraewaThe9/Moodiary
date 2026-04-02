# ใช้ Node.js เป็นฐาน
FROM node:18

# ติดตั้ง Python และ pip
RUN apt-get update && apt-get install -y python3 python3-pip

# กำหนดโฟลเดอร์ทำงาน
WORKDIR /app

# ก๊อปปี้ไฟล์โปรเจกต์ทั้งหมด
COPY . .

# ติดตั้ง Library ของ Node.js
RUN npm install

# ติดตั้ง Library ของ Python
RUN python3 -m pip install --no-cache-dir -r requirements.txt

# สั่งรันทั้งสองอย่างพร้อมกัน
CMD node server.js & python3 app.py