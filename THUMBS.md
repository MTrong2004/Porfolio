# Thumbnails hướng dẫn

Để tối ưu tải trang, mã nguồn đã tự động tìm thumbnail tại `assets/thumbs/...` thay vì ảnh gốc `assets/images/...`.

Cách hoạt động:
- Đường dẫn gốc: `assets/images/Ky1/DRS102/picture1-1.png`
- Ảnh hiển thị: `assets/thumbs/Ky1/DRS102/picture1-1.jpg` (nếu tồn tại). Nếu không có, sẽ fallback về ảnh gốc.
- Lightbox vẫn dùng ảnh gốc để giữ chất lượng.

## Tạo thumbnail
Chạy script (cần PowerShell và nên cài ImageMagick):
```
powershell -ExecutionPolicy Bypass -File scripts/generate-thumbs.ps1 -MaxWidth 600 -Quality 75 -SkipExisting
```
Tuỳ chọn:
- `-MaxWidth`: chiều rộng max (mặc định 600)
- `-Quality`: chất lượng JPEG (mặc định 75)
- `-SkipExisting`: bỏ qua file nếu đã tồn tại
- `-Force`: tạo lại kể cả khi đã tồn tại
- `-WebP`: xuất thêm bản `.webp` (nếu hỗ trợ)
- `-DryRun`: chỉ in danh sách, không tạo file

## Quy trình gợi ý
1. Thêm / cập nhật ảnh gốc vào `assets/images`.
2. Chạy script tạo thumbnail.
3. Commit cả thư mục `assets/thumbs` (nếu deploy tĩnh).
4. Kiểm tra trang: tốc độ list nhanh hơn, khi mở lightbox thấy ảnh nét.

## Ghi chú
- Script tự phát hiện alpha: nếu ảnh gốc có alpha sẽ tạo PNG thay vì JPG để giữ trong suốt.
- Thêm tuỳ chọn `-WebP` để sinh thêm phiên bản WebP (tương lai có thể ưu tiên tải WebP qua `<picture>` nếu muốn nâng cấp).
- Ảnh có thể tạo lại cưỡng bức bằng `-Force` (bỏ qua `-SkipExisting`).
- Muốn nhỏ hơn nữa cho mobile: dùng `-MaxWidth 480` hoặc `-MaxWidth 360`.
