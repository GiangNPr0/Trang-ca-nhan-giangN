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

### a) Sửa 3 lỗi hiện trong trình soạn thảo Cloudflare (19/09/2026)

Khi dán code vào **Edit code**, editor của Cloudflare kiểm tra kiểu (TypeScript) và đã báo:

| Lỗi editor | Bản chất | Cách sửa trong file này |
|---|---|---|
| `Cannot find name 'env'` (2 dòng, tại `if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID)`) | **LỖI THẬT khi chạy**: trong Worker, `env` **không phải biến toàn cục**, nó chỉ là tham số của `fetch(request, env)`. Hàm `verifyGoogle(request)` cũ dùng `env` mà không nhận vào → mọi request có token (`/post`, `/favorite`, `/admin`) sẽ ném `ReferenceError: env is not defined` → Worker trả **500** | `verifyGoogle(request, env)` + **mọi chỗ gọi đều truyền `env`**; thêm điều kiện an toàn `env && env.GOOGLE_CLIENT_ID`; khai báo `@param {Env} env` cho tất cả hàm dùng `env` |
| `Property 'status' does not exist on type 'Error'` (tại `err.status = status`) | Chỉ là **cảnh báo kiểu**, chạy vẫn được (JS cho gắn thêm thuộc tính vào Error) | `httpError()` dùng `Object.assign(new Error(message), { status })` và có `errorStatus(err)` đọc mã trạng thái an toàn |

Ngoài ra file được **viết lại sạch mã hoá** (không còn chuỗi tiếng Việt bị lỗi font kiểu `KhÃ´ng tÃ¬m tháº¥y`).

### b) Giữ khoá `projects` của Kho Dự án

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

## ⛔ Lỗi 401 "Đọc jsonbin thất bại" — thiếu `JSONBIN_MASTER_KEY` trong Worker (19/09/2026)

Kiểm tra thật lúc này: `GET https://giangn.n-giang06022000.workers.dev/data`
→ `HTTP 500` với body `{"error":"Đọc jsonbin thất bại: 401"}`.

Nghĩa là Worker **chạy được** nhưng **không xác thực được với jsonbin** ⇒ biến môi trường
`JSONBIN_MASTER_KEY` đang **thiếu / sai / có khoảng trắng thừa**. Cần làm:

1. Cloudflare Dashboard → Worker → **Settings** → **Variables and Secrets**
2. Thêm (hoặc sửa) **`JSONBIN_MASTER_KEY`** — kiểu **Secret** — dán **đúng** Master Key của jsonbin.io:
   - Lấy tại: jsonbin.io → **Account** → **API Keys** → *Master Key* (chuỗi bắt đầu bằng `$2a$10$`, dài 60 ký tự)
   - **Không** dán kèm dấu nháy `'` `"`, **không** có dấu cách hay xuống dòng ở đầu/cuối khoá
   - Khoá cũ của trang còn lưu trong máy tại `Documents\_giangN-backup\index.html.bak` (dòng có `JSONBIN_MASTER_KEY`)
3. (Tuỳ chọn) `JSONBIN_BIN_ID` = `6a9fd4f2ac6210605ab2e044` — sai bin ID cũng gây 401
4. **Deploy** lại → chạy `powershell -ExecutionPolicy Bypass -File cloudflare-worker\kiem-tra-worker.ps1`
   → phải thấy `HTTP 200` và danh sách khoá.

## Cách deploy (tóm tắt)

1. Mở https://dash.cloudflare.com → **Workers & Pages** → Worker `giangn` → **Edit code**.
2. Xoá hết code cũ, dán **toàn bộ** nội dung `cloudflare-worker/worker.js` (bản trong repo này) → **Deploy**.
   *(Sau khi dán, editor phải KHÔNG còn gạch đỏ. Nếu còn dòng nào báo `Cannot find name 'env'` tức là bạn đang dán bản cũ.)*
3. Kiểm tra: mở `https://giangn.n-giang06022000.workers.dev/data` → thấy `"projects": [ … ]` trong JSON,
   hoặc chạy `powershell -ExecutionPolicy Bypass -File cloudflare-worker\kiem-tra-worker.ps1` → phải báo **OK**.
4. Vào trang **Dự án** → đăng nhập Google admin → thêm ảnh → chip trạng thái phải hiện `💾 Đã lưu`.
   *(Nếu dữ liệu cũ đang được khôi phục từ bản lưu tạm, bấm nút **Lưu lại** để đẩy lên bin.)*

## Kiểm thử đã chạy cho `worker.js` (19/09/2026)

Chạy thật file trong trình duyệt (giả lập jsonbin + tokeninfo), kết quả:

| Phép thử | Kết quả |
|---|---|
| `GET /data` | 200, trả đủ `messages, ratings, albums, **projects**` |
| `POST /favorite` (khách thả tim) | 200, phần ghi lên jsonbin **có `projects`** → không còn xoá Kho Dự án |
| `POST /post` (khách gửi lời nhắn) | 200, phần ghi lên jsonbin **có `projects`** |
| `POST /admin` (store có `projects`) | 200, phản hồi có `projects`, đúng tiêu đề dự án gửi lên |
| `POST /admin` (store **thiếu** khoá `projects`) | 200, **giữ nguyên** Kho Dự án đang có trong bin (van an toàn) |
| `POST /admin` với token không phải admin | 403 "Tài khoản này không phải quản trị viên" |
| `POST /favorite` thiếu token | 401 "Thiếu token đăng nhập Google" |
| `OPTIONS` (CORS) | 204 + `Access-Control-Allow-Origin` |

