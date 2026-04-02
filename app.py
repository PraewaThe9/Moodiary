from flask import Flask, request, jsonify
from flask_cors import CORS
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
import os

app = Flask(__name__)
CORS(app) # อนุญาตให้หน้าเว็บ (HTML) เรียกใช้งาน API นี้ได้


# --- การตั้งค่าพาธโมเดล ---
MODEL_PATH = "./final_moodiary_model"
CHECKPOINT = "./final_moodiary_model"
print("Loading Model... Please wait.")
tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT)

# โหลดโมเดลครั้งเดียวพร้อมกำหนด 6 Labels และเข้าโหมด eval
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, num_labels=6)
model.eval() 

MOOD_LABELS = {
    0: "โกรธ", 
    1: "กังวล", 
    2: "มีความสุข", 
    3: "มีความรัก", 
    4: "โอเคดี", 
    5: "เศร้า" 
}

# โหลดโมเดลแบบใส่จำนวน Label ให้ตรงกับ .tsv (6 อารมณ์)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH, num_labels=6)
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'No text provided'}), 400

        # 1. Tokenize ข้อความที่รับมาจากหน้าเว็บ
        inputs = tokenizer(text, return_tensors="pt", truncation=True, padding=True, max_length=128)

        # 2. ส่งให้ WangchanBERTa วิเคราะห์
        with torch.no_grad():
            outputs = model(**inputs)
        
        # 3. แปลงค่าตัวเลขเป็นชื่ออารมณ์
        prediction = torch.nn.functional.softmax(outputs.logits, dim=-1)
        label_id = torch.argmax(prediction).item()
        mood_result = MOOD_LABELS.get(label_id, "ไม่ระบุ")

        print(f"Input: {text} | Result: {mood_result}")

        return jsonify({
            'mood': mood_result,
            'confidence': torch.max(prediction).item()
        })

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # รันที่ Port 5000
    app.run(host='0.0.0.0', port=5000, debug=True)