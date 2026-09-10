# Trang cá nhân Giang Nguyễn

## Dữ liệu được lưu ngay trong dự án (không còn dùng bên thứ 3)

Trước đây lời nhắn & lượt yêu thích được lưu trên **JSONBin.io** (dịch vụ bên thứ 3).
Nay toàn bộ dữ liệu nằm trong file **`data.js`** ở cùng thư mục này — bạn toàn quyền quản lý.

### File dữ liệu: `data.js`

```js
window.SITE_DATA = {
  "messages": [
    { "name": "Tên", "message": "Nội dung", "image": null, "time": "10:00 10/9/2026" }
  ],
  "ratings": {
    "image/albummeme/1 (1).jpg": { "favorites": 3 }
  }
};
```

- `messages`: danh sách lời nhắn (mở nhất trước). `image` là chuỗi `data:image/...;base64,...` hoặc `null`.
- `ratings`: bản đồ số lượt yêu thích theo đường dẫn ảnh (khóa chính là `src` của ảnh).

### Khi có lời nhắn / lượt yêu thích mới phát sinh như thế nào?

1. Người truy cập gửi lời nhắn hoặc bấm "Yêu thích" trên trang → dữ liệu được lưu tạm (backup) trong trình duyệt.
2. Trang hiện hộp **"Dữ liệu mới đã sẵn sàng lưu vào project"** kèm nút **"Tải data.js đã cập nhật"**.
3. Bạn bấm nút đó → tải về file `data.js` mới nhất, rồi **thay thế file `data.js` trong thư mục dự án** (hoặc copy lên hosting). Lời nhắn/lượt yêu thích mới sẽ hiển thị với mọi người.

> Mẹo: Cũng có thể mở thẳng `data.js` và tự sửa bằng tay (thêm/sửa/xóa) — trước mắt nên tạo bản sao lưu ở thư mục `báckup/`.

### Lưu ý

- Nếu mở thẳng bằng `double-click` (giao thức `file://`) một số trình duyệt chặn đọc các file đồng, nhưng `data.js` dùng cơ chế `<script>` nên vẫn hoạt động.
- Không còn giới hạn 90KB của JSONBin nữa; tuy nhiên ảnh đính kèm base64 rất nặng, nên ưu tiên ảnh nhỏ (trang đã tự nén ảnh xuống <45KB trước khi gửi).