# cloudflare-worker — Proxy jsonbin cho trang cá nhân Giang Nguyễn

Thư mục này giữ **bản sao** file `worker.js` của Cloudflare Worker (proxy che khoá jsonbin).
Bản gốc để deploy: `H:\Other computers\máy ở c.ty\_giangN-backup\cloudflare-worker\worker.js`
(kèm `HUONG-DAN.md` hướng dẫn deploy chi tiết). **Nhớ sửa cả 2 bản khi có thay đổi.**

> ⚠️ **KIỂM TRA NGAY (19/09/2026): Worker đang chạy trên Cloudflare VẪN LÀ BẢN CŨ.**
> Kết quả gọi thật `https://giangn.n-giang06022000.workers.dev/data` chỉ trả về
> `messages, ratings, albums` — **thiếu `projects`**. Đây chính là lý do ảnh/video thêm ở trang
> Dự án không đồng bộ được. Chạy script kiểm tra bất cứ lúc nào:
> ```powershell
> powershell -ExecutionPolicy Bypass -File cloudflare-worker\kiem-tra-worker.ps1
> ```
> (OK = đã deploy bản mới; CẢNH BÁO = còn bản cũ, xem mục "Cách deploy" bên dưới.)

## Vì sao cần deploy lại Worker mới? (lỗi "CHƯA LƯU — cloud đã nhận nhưng KHÔNG trả về khoá projects")

Worker ghi dữ liệu qua hàm `normStore()` — hàm này là **danh sách trắng (whitelist)**: nó chỉ giữ
`messages`, `ratings`, `albums`. Bản cũ **KHÔNG có `projects`**, nên:

- Trang **Dự án** (`du-an/du-an.js`) gửi ảnh/video lên → Worker ghi bin **đã xoá sạch khoá `projects`**
  → phản hồi `/admin` không có `projects` → trang Dự án báo `⚠ CHƯA LƯU … bin/Worker đang bỏ khoá này`
  và mọi thứ vừa thêm **biến mất** khi tải lại trang.
- Tệ hơn: mỗi lần khách **gửi lời nhắn** (`/post`) hoặc **thả tim** (`/favorite`), Worker đọc bin rồi
  ghi lại qua `normStore()` → cũng xoá `projects` theo.

## Bản mới đã sửa gì

1. `normStore()` giữ thêm khoá `projects` (`normProjects()` lọc phần tử hỏng, giữ nguyên mọi trường
   khác — rất quan trọng: `media` chứa URL ảnh/video Cloudinary):
   - `projects` là **mảng** (kể cả `[]`) → giữ nguyên
   - `projects` = **null** → giữ `null` (nghĩa là "chưa tuỳ chỉnh", trang Dự án dùng 5 danh mục mặc định)
   - nguồn **không có** khoá này → không thêm khoá rác vào bin
2. `handleAdmin()` có thêm "van an toàn": nếu bản gửi lên **thiếu khoá `projects`** (trình duyệt còn
   cache bản JS cũ) thì **giữ nguyên** Kho Dự án đang có trong bin, không xoá.
3. `du-an/du-an.js` phía web cũng đã sửa (xem `du-an/du-an.js`):
   - mọi thao tác *sửa/thêm ảnh vào một danh mục mặc định* đều gọi `duanMaterialize()` trước khi lưu
     (trước đây gửi `projects: null` → coi như "chưa tuỳ chỉnh" nên không lưu được gì);
   - sau khi ghi, nếu phản hồi không kèm `projects`, web **đọc lại `/data` để kiểm chứng** thay vì
     báo lỗi oan; chỉ khi bin thật sự không giữ `projects` mới báo "CHƯA LƯU" kèm hướng dẫn deploy lại Worker.

## Cách deploy (tóm tắt)

1. Mở https://dash.cloudflare.com → **Workers & Pages** → Worker `giangn` → **Edit code**.
2. Xoá hết code cũ, dán **toàn bộ** nội dung `cloudflare-worker/worker.js` (bản trong repo này) → **Deploy**.
3. Kiểm tra: mở `https://giangn.n-giang06022000.workers.dev/data` → sau khi lưu dự án ở web sẽ thấy
   `"projects": [ … ]` trong JSON.
4. Vào trang **Dự án** → đăng nhập Google admin → thêm ảnh → chip trạng thái phải hiện `💾 Đã lưu`.
