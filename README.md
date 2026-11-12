# Cờ Tướng 3D — Xiangqi Online cho Android

Game cờ tướng cho điện thoại Android: giao diện gỗ – vàng, bàn cờ nghiêng 3D và **hiệu ứng 3D khi mất quân**.
Khi bị ăn, quân cờ bật lên, xoay lật trong không gian rồi vỡ thành nhiều mảnh, kèm sóng xung kích, tia lửa, khói,
rung màn hình và rung máy.

## Tính năng
- **Chơi online**: ghép trận nhanh, hoặc tạo phòng riêng bằng mã 4 số để mời bạn bè. Có gửi biểu cảm, xin thua, đấu lại (đổi màu quân).
  Máy chủ kiểm tra lại mọi nước đi nên không gian lận được.
- **Chơi với máy**: AI dùng alpha-beta, có 3 mức Dễ / Vừa / Khó, chọn cầm Đỏ hoặc Đen.
- **Hai người một máy**.
- Luật đầy đủ: mã bị cản chân, tượng bị cản mắt, pháo ăn qua ngòi, tướng không được đối mặt, không được để tướng bị chiếu,
  hết nước đi là thua, hoà khi lặp nước 3 lần hoặc 60 nước liền không ăn quân.
- Đi lại, gợi ý nước đi, xoay bàn cờ, báo "Chiếu tướng!" bằng chữ 3D, âm thanh tạo bằng WebAudio (không cần file âm thanh).

## Cấu trúc
```
web/       Game (HTML/CSS/JS): luật cờ, AI, hiệu ứng 3D, giao diện. Đóng gói vào APK và cũng được server phục vụ
android/   Project Android (WebView, vibration bridge, nút Back)
server/    Máy chủ online Node.js + WebSocket (kiểm tra nước đi, ghép trận, phòng riêng)
```

## Tải APK
Mỗi lần push, GitHub Actions (`.github/workflows/android.yml`) sẽ build APK.
Vào tab **Actions** → lần chạy mới nhất → tải artifact **CoTuong3D-apk**, rồi cài `app-release.apk` (hoặc `app-debug.apk`) lên điện thoại.

Tự build bằng Android Studio: mở thư mục `android/` rồi Run, hoặc chạy `cd android && ./gradlew assembleDebug`.
APK release đang ký bằng khoá debug cho dễ cài. Muốn đưa lên Google Play thì cần ký bằng keystore riêng.

## Chạy máy chủ online
```bash
cd server
npm install
npm start            # mặc định cổng 3000, đổi bằng PORT=8080 npm start
```
Trong app, vào **Chơi online** rồi nhập địa chỉ máy chủ:
- Cùng mạng Wi-Fi: `ws://<IP máy tính>:3000`, ví dụ `ws://192.168.1.10:3000`
- Máy chủ trên Internet (VPS, Render, Railway, Fly.io…): `wss://ten-mien-cua-ban`

Có thể chạy bằng Docker (lệnh chạy từ thư mục gốc repo):
```bash
docker build -f server/Dockerfile -t cotuong .
docker run -p 3000:3000 cotuong
```
Server cũng phục vụ luôn bản web, nên có thể mở `http://<máy chủ>:3000` trên trình duyệt để chơi với người dùng Android.

## Kiểm thử
```bash
cd server && npm test   # perft luật cờ (44 / 1920 / 79666), AI, và kịch bản online 2 người chơi
```
