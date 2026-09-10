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

### Khi có lời nhắn / lượt yêu thích mới — sẽ TỰ ĐỘNG cập nhật

1. Trang dùng **File System Access API**: **lần đầu tiên** bạn gửi lời nhắn hoặc bấm "Yêu thích", trình duyệt (Edge/Chrome) hiện hộp thoại lưu file — hãy chọn **file `data.js` trong thư mục dự án** rồi bấm Save (chấp nhận ghi đè nếu được hỏi).
2. Từ đó trở đi, **mọi lời nhắn / lượt yêu thích được TỰ ĐỘNG ghi đè vào `data.js`**, không cần thao tác gì thêm. Mỗi lần lưu chỉ hiện thông báo nhỏ "✓ Đã tự động lưu" ở góc phải màn hình.
3. Quyền ghi file được trình duyệt nhớ (lưu trong IndexedDB), nên các lần sau không bị hỏi lại.

> Bạn chỉ cần mở trang bằng đúng file `index.html` trên máy đặt chứa dự án thì mọi dữ liệu mới luôn đồng bộ tự động — dữ liệu nằm hoàn toàn trong dự án của bạn, không qua bên thứ 3.

### Trình duyệt không hỗ trợ tự lưu (Firefox, Safari, ...)

Trang sẽ tự hạ cấp: hiện toast đỏ **"Trình duyệt chưa cho tự lưu file"** kèm link **"tải thủ công"** — bấm để tải `data.js` rồi đè file cũ theo cách thủ công. Dữ liệu vẫn được backup tạm trong trình duyệt nên không bị mất khi tải lại trang.

### Lưu ý

- Khuyến nghị mở trang bằng **Edge hoặc Chrome** để được tự động lưu.
- Vẫn có thể mở thẳng `data.js` và tự sửa bằng tay (thêm/sửa/xóa lời nhắn, lượt yêu thích). Nên sao lưu ở thư mục `báckup/` trước khi sửa.
- Không còn giới hạn 90KB của JSONBin nữa; tuy nhiên ảnh đính kèm base64 rất nặng, nên ưu tiên ảnh nhỏ (trang đã tự nén ảnh xuống <45KB trước khi gửi).