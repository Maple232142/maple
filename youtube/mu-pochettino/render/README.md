# Dựng video MU

Dựng video dài (1920×1080) và 3 Shorts (1080×1920) từ `content.py`. Toàn bộ đồ họa tự vẽ; ảnh thật chỉ dùng khi bạn đặt vào thư mục `PHOTO_DIR`.

Cần: ffmpeg, `pip install piper-tts rembg[cpu] pillow numpy`, giọng đọc `vi_VN-vais1000-medium` (gói `vits-piper-vi_VN-vais1000-medium` trong mục tts-models của sherpa-onnx trên GitHub).

```bash
export PHOTO_DIR=/đường/dẫn/ảnh   # Pochettino.jpg, Carrick.jpg, bg_*.jpg (tùy chọn)
python3 build.py <thư_mục_giọng> <thư_mục_ra> all
python3 thumb.py <thư_mục_ra>/thumbnail.png
```

Tên trong `PHOTO_DIR`: `Pochettino.*` và `Carrick.*` được tách nền tự động; `bg_stadium`, `bg_train1..5`, `bg_carrick1..2` làm ảnh nền (xem `BG_OVERRIDE` trong `content.py`).
Ảnh không được commit vào repo vì vấn đề bản quyền.
