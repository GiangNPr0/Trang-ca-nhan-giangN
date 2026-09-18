/* ============================================================================
 * du-an/du-an.js — Logic "Kho Dự án & Danh mục" cho trang du-an/index.html
 *
 * NGƯỜI XEM : xem dự án theo danh mục, xem ảnh (lightbox) và video / YouTube / Facebook ngay trên web.
 *             Khung hiển thị TỰ ĐỔI THEO TỈ LỆ: media dọc (9:16) → khung dọc, media ngang → khung ngang
 *             ở bìa dự án, dải thumbnail, khung xem và ô xem trước trong form (xem mục
 *             "NHẬN BIẾT MEDIA DỌC / NGANG" bên dưới).
 * QUẢN TRỊ  : đăng nhập Google (email nằm trong danh sách ADMIN) rồi thêm/sửa/xoá dự án và tải
 *             ẢNH/VIDEO TRỰC TIẾP TỪ WEB (lên Cloudinary) hoặc dán link có sẵn (YouTube, Facebook,
 *             Vimeo, Google Drive, link ảnh/video trực tiếp).
 *
 * DỮ LIỆU  : nằm trong cùng "store" của trang chủ (window.SITE_DATA) ở khoá `projects` nên được lưu
 *             theo đúng 3 chế độ mà app.js đang dùng:
 *               1) Server mini PC    : GET/PUT /api/data
 *               2) Cloud (jsonbin)   : proxy Cloudflare — đọc /data, ghi /admin (cần ID token admin)
 *               3) Offline (file://) : ghi lại ../data.js bằng File System Access API, hoặc tải về
 *             `projects: null` = chưa tuỳ chỉnh → dùng 5 danh mục mặc định.
 *             `projects: []`   = đã xoá hết → hiện trạng thái rỗng (không tự mọc lại mặc định).
 * ========================================================================== */

// ==================== CẤU HÌNH ====================
// Cloudinary: giữ đúng thông tin đang dùng ở trang chủ (app.js). Preset Unsigned dành cho Kho Dự án là
// `GiangNweb_duan` (nếu preset đó chưa tồn tại, code tự thử lại bằng preset của trang chủ).
const DUAN_CLOUDINARY_CLOUD_NAME = 'g9uxwrbl';
const DUAN_CLOUDINARY_PRESET = 'GiangNweb_duan';
const DUAN_CLOUDINARY_FALLBACK_PRESET = 'GiangNweb';
const DUAN_CLOUDINARY_FOLDER = 'du-an';
// MỖI DỰ ÁN MỘT THƯ MỤC RIÊNG trên Cloudinary: `du-an/<ten-du-an>` (slug không dấu lấy từ tiêu đề).
// LƯU Ý QUAN TRỌNG: upload preset Unsigned phải để Folder = **Dynamic** (hoặc bỏ trống) và tài khoản
// bật Settings → Media Library → Dynamic folders. Nếu preset đang CỐ ĐỊNH Folder thì Cloudinary sẽ
// BỎ QUA thư mục gửi kèm (mọi ảnh/video vẫn nằm ở folder cố định) — code sẽ cảnh báo ngay khi upload.
// Đặt false nếu muốn tất cả media nằm chung trong DUAN_CLOUDINARY_FOLDER.
const DUAN_FOLDER_PER_PROJECT = true;
const DUAN_IMAGE_MAX_DIMENSION = 1920;
const DUAN_IMAGE_MAX_BYTES = 1200 * 1024;        // ảnh sau khi nén (~1.2MB)
const DUAN_VIDEO_MAX_BYTES = 100 * 1024 * 1024;  // giới hạn 1 file của Cloudinary gói free
const DUAN_THUMB_WIDTH = { card: 640, viewer: 1600, small: 240, poster: 640 };

// Google + proxy: dùng CHUNG cấu hình với trang chủ để tận dụng phiên đăng nhập sẵn có
const DUAN_GOOGLE_CLIENT_ID = '390847354134-gur7ga9qgd71j1uvpsdl3js716cnifk0.apps.googleusercontent.com';
const DUAN_PROXY_URL = 'https://giangn.n-giang06022000.workers.dev';
const DUAN_ADMIN_EMAILS = ['n.giang06022000@gmail.com', 'bichngocng1908@gmail.com'];

const DUAN_DATA_FILE_NAME = 'data.js';        // dùng chung khoá IndexedDB với app.js
const DUAN_BACKUP_KEY = 'giang_du_an_projects';
const DUAN_DIRTY_KEY = 'giang_du_an_dirty';
const DUAN_SESSION_KEY = 'giang_google_user'; // cùng khoá với app.js: từ trang chủ sang vẫn đăng nhập

// 5 danh mục cố định (khớp tab lọc + màu badge)
const DUAN_CATEGORIES = [
    { key: 'anh', label: 'Ảnh', color: 'is-blue' },
    { key: 'giai-tri', label: 'Giải trí', color: 'is-purple' },
    { key: 'thoi-trang', label: 'Thời trang', color: 'is-pink' },
    { key: 'tvc', label: 'TVC', color: 'is-emerald' },
    { key: 'video-beauty', label: 'Video Beauty/Sản phẩm', color: 'is-amber' }
];

// ==================== TRẠNG THÁI ====================
let duanFullStore = {};              // bản ghi đầy đủ (giữ nguyên messages/ratings/albums/... khi ghi lại)
let duanProjects = [];               // danh sách dự án đang hiển thị
let duanProjectsSource = 'default';  // 'default' = 5 danh mục mặc định (chưa lưu) | 'store' = dữ liệu thật
let duanMode = 'offline';            // 'server' | 'cloud' | 'offline'
let duanSaveQueue = Promise.resolve();
let duanGoogleUser = null;
let duanIdToken = null;
let duanAuthReady = false;
let duanCategory = 'all';
let duanOpenProjectId = null;
let duanViewIndex = 0;
let duanFormMedia = [];
let duanFormEditId = null;
let duanFormDraftId = '';   // id dự kiến cho dự án mới (dùng làm tên thư mục khi tiêu đề còn trống)
let duanLightboxList = [];
let duanLightboxIndex = 0;
let duanFocusedBefore = null;

// ==================== TIỆN ÍCH NHỎ ====================
function duanEl(id) { return document.getElementById(id); }

function duanEscape(value) {
    return String(value === null || value === undefined ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function duanToast(message, ok) {
    const toast = duanEl('duanToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'duan-toast ' + (ok ? 'is-ok' : 'is-err');
    clearTimeout(window.__duanToastTimer);
    window.__duanToastTimer = setTimeout(() => toast.classList.add('hidden'), 3600);
}

function duanShow(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('flex');
}

function duanHide(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('flex');
}

function duanNewId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function duanCategoryInfo(key) {
    return DUAN_CATEGORIES.find(c => c.key === key) || { key: key, label: 'Khác', color: 'is-gray' };
}

function duanMediaTypeLabel(type) {
    if (type === 'video') return 'Video';
    if (type === 'embed') return 'Nhúng';
    return 'Ảnh';
}

// Chuẩn hoá liên kết người dùng nhập: thêm https:// khi chỉ gõ tên miền, chặn javascript:
function duanCleanLink(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^(https?:|\/|\.\/|\.\.\/|#)/i.test(url)) return url;
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$|\?|#)/i.test(url)) return 'https://' + url;
    return 'https://' + url;
}
// ==================== NHẬN BIẾT MEDIA DỌC / NGANG (tối ưu hiển thị thumbnail) ====================
// Bìa dự án, dải thumbnail, khung xem và ô xem trước trong form đều tự đổi khung theo tỉ lệ thật:
//   • Biết trước tỉ lệ  : upload xong Cloudinary trả về width/height (lưu vào `w`/`h` của media)
//                         hoặc file trong máy (đọc được kích thước ảnh/video trước khi tải lên).
//   • Chưa biết tỉ lệ   : media cũ / link dán từ web → tạm để khung NGANG, khi ảnh hoặc video
//                         tải xong thì đo naturalWidth/naturalHeight rồi đổi khung ngay; kết quả
//                         được nhớ trong phiên (duanRatioCache) nên lần sau hiện đúng ngay lập tức.
//   • Biết chắc là dọc  : link YouTube Shorts, Facebook Reels → khung dọc luôn.
const duanRatioCache = {};   // key → 'portrait' | 'landscape' (chỉ trong phiên, khoá theo URL)

// Khoá ngắn, an toàn cho CSS selector (data-duan-media="...") từ URL media
function duanRatioKey(url) {
    const text = String(url || '');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
    return 'r' + Math.abs(hash).toString(36);
}

// 'portrait' (dọc) hay 'landscape' (ngang) cho 1 media
function duanMediaOrientation(media) {
    if (!media || !media.url) return 'landscape';
    const w = Number(media.w) || 0;
    const h = Number(media.h) || 0;
    if (w > 0 && h > 0) return w >= h ? 'landscape' : 'portrait';
    const cached = duanRatioCache[duanRatioKey(media.url)];
    if (cached) return cached;
    const detected = duanDetectMedia(media.url);
    if (detected && detected.ratio) return detected.ratio;  // Shorts / Reels: chắc chắn là dọc
    return 'landscape';
}

// Đã biết tỉ lệ (kèm ảnh/video) hay chưa → quyết định có cần gắn hàm đo khi tải xong hay không
function duanRatioKnown(media) {
    if (!media) return true;
    if ((Number(media.w) || 0) > 0 && (Number(media.h) || 0) > 0) return true;
    if (duanRatioCache[duanRatioKey(media.url)]) return true;
    const detected = duanDetectMedia(media.url);
    return !!(detected && detected.ratio);
}

// Hàm đo gắn vào <img onload> / <video onloadedmetadata> (chỉ gắn khi tỉ lệ chưa biết)
function duanRatioProbeAttrs(media) {
    if (!media || !media.url || duanRatioKnown(media)) return '';
    const key = duanRatioKey(media.url);
    const handler = media.type === 'video' ? 'onloadedmetadata' : 'onload';
    return ' ' + handler + '="duanMeasureRatio(this, \'' + key + '\')"';
}

// Ảnh/video đã tải xong → đo tỉ lệ thật rồi đổi khung của mọi ô đang hiển thị cùng media đó
function duanMeasureRatio(el, key) {
    if (!el || !key) return;
    const w = el.naturalWidth || el.videoWidth || 0;
    const h = el.naturalHeight || el.videoHeight || 0;
    if (!w || !h) return;
    const orientation = w >= h ? 'landscape' : 'portrait';
    if (duanRatioCache[key] === orientation) return;
    duanRatioCache[key] = orientation;
    document.querySelectorAll('[data-duan-media="' + key + '"]').forEach(node => {
        node.classList.toggle('is-portrait', orientation === 'portrait');
    });
}

// ==================== NHẬN DẠNG ẢNH / VIDEO TỪ LINK ====================
// Từ 1 URL bất kỳ (ảnh, video, YouTube, Facebook, Vimeo, Google Drive) → biết cách hiển thị:
//   'image' : hiện <img>
//   'video' : hiện <video controls> (file .mp4/.webm/... hoặc video trên Cloudinary)
//   'embed' : hiện <iframe> (YouTube / Vimeo / Facebook / Google Drive)
function duanDetectMedia(rawUrl) {
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
    if (!url) return null;
    const lower = url.toLowerCase();

    const youtube = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (youtube) {
        return {
            type: 'embed',
            provider: 'youtube',
            url: url,
            // YouTube Shorts là video dọc → khung dọc luôn, không cần đo
            ratio: /youtube(?:-nocookie)?\.com\/shorts\//i.test(url) ? 'portrait' : '',
            embedUrl: 'https://www.youtube-nocookie.com/embed/' + youtube[1] + '?rel=0&modestbranding=1',
            thumb: 'https://i.ytimg.com/vi/' + youtube[1] + '/hqdefault.jpg'
        };
    }
    const vimeo = lower.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
    if (vimeo) {
        return { type: 'embed', provider: 'vimeo', url: url, thumb: '', embedUrl: 'https://player.vimeo.com/video/' + vimeo[1] };
    }
    if (/(facebook\.com|fb\.watch)/.test(lower)) {
        return {
            type: 'embed',
            provider: 'facebook',
            url: url,
            thumb: '',
            // Facebook Reels là video dọc → khung dọc
            ratio: /\/reels?\//i.test(lower) ? 'portrait' : '',
            embedUrl: 'https://www.facebook.com/plugins/video.php?show_text=false&width=734&href=' + encodeURIComponent(url)
        };
    }
    const drive = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([A-Za-z0-9_-]{10,})/);
    if (drive) {
        return {
            type: 'embed',
            provider: 'drive',
            url: url,
            embedUrl: 'https://drive.google.com/file/d/' + drive[1] + '/preview',
            thumb: 'https://drive.google.com/thumbnail?id=' + drive[1] + '&sz=w640'
        };
    }

    if (/\/video\/upload\//i.test(url) || /\.(mp4|webm|ogv|ogg|mov|m4v|m3u8)(\?|#|$)/i.test(url)) {
        return { type: 'video', url: url, thumb: duanVideoPoster(url) };
    }
    return { type: 'image', url: url, thumb: duanThumbUrl(url, DUAN_THUMB_WIDTH.card) };
}

// Ảnh Cloudinary → thêm transformation để trả về bản nhẹ (WebP/AVIF) thay vì ảnh gốc nặng
function duanThumbUrl(url, width) {
    if (typeof url !== 'string' || !url) return '';
    const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i);
    if (!match) return url;                                  // ảnh ở nơi khác: giữ nguyên
    if (/^[a-z]{1,3}_[^/]*\//i.test(match[2])) return url;    // đã có transformation sẵn: không thêm nữa
    return match[1] + 'f_auto,q_auto,w_' + width + '/' + match[2];
}

// Ảnh đại diện cho video Cloudinary: lấy khung hình đầu (so_0) → 1 ảnh jpg nhẹ, KHÔNG tải video
function duanVideoPoster(url) {
    const match = String(url || '').match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.*)$/i);
    if (!match) return '';
    const rest = match[2];
    if (/^[a-z]{1,3}_[^/]*\//i.test(rest)) return '';
    const base = rest.replace(/\.(mp4|webm|mov|m4v|ogv|ogg)$/i, '');
    return match[1] + 'so_0,f_jpg,q_auto,w_' + DUAN_THUMB_WIDTH.poster + '/' + base + '.jpg';
}

// Đếm số ảnh / video của 1 dự án (video nhúng cũng tính là video)
function duanMediaCounts(mediaList) {
    const list = Array.isArray(mediaList) ? mediaList : [];
    let image = 0;
    let video = 0;
    list.forEach(item => {
        const media = duanDetectMedia(item && item.url ? item.url : item);
        if (!media) return;
        if (media.type === 'image') image += 1; else video += 1;
    });
    return { image: image, video: video };
}
// ==================== CHUẨN HOÁ DỮ LIỆU DỰ ÁN ====================
function duanNormalizeMedia(item) {
    const url = typeof item === 'string' ? item : (item && item.url);
    if (typeof url !== 'string' || !url.trim()) return null;
    const detected = duanDetectMedia(url);
    if (!detected) return null;
    // w/h = kích thước thật (Cloudinary trả về khi upload) → dùng để chọn khung dọc/ngang ngay,
    // không phải chờ ảnh tải xong mới biết. Media cũ không có w/h thì tự đo khi hiển thị.
    return {
        url: detected.url,
        type: detected.type,
        w: Math.max(0, Number(item && item.w) || 0),
        h: Math.max(0, Number(item && item.h) || 0)
    };
}

function duanNormalizeProject(item) {
    if (!item || typeof item !== 'object') return null;
    const title = String(item.title || '').trim();
    if (!title) return null;
    return {
        id: typeof item.id === 'string' && item.id ? item.id : duanNewId(),
        title: title.slice(0, 140),
        description: String(item.description || '').slice(0, 600),
        category: DUAN_CATEGORIES.some(c => c.key === item.category) ? item.category : DUAN_CATEGORIES[0].key,
        link: typeof item.link === 'string' ? item.link : '',
        linkLabel: typeof item.linkLabel === 'string' ? item.linkLabel.slice(0, 40) : '',
        media: (Array.isArray(item.media) ? item.media : []).map(duanNormalizeMedia).filter(Boolean),
        createdAt: Number(item.createdAt) || Date.now()
    };
}

// null = nguồn dữ liệu CHƯA có khoá `projects` (coi như chưa tuỳ chỉnh) | mảng = dữ liệu thật
function duanNormalizeProjects(record) {
    if (!record || !Array.isArray(record.projects)) return null;
    return record.projects.map(duanNormalizeProject).filter(Boolean);
}

// 5 danh mục mặc định — giữ đúng nội dung trang du-an trước đây để trang không bị trống khi mới cập nhật
function duanDefaultProjects() {
    return [
        {
            id: 'default-anh',
            title: 'Bộ sưu tập nhiếp ảnh nghệ thuật',
            category: 'anh',
            description: 'Ghi lại góc nhìn đời sống và phong cảnh với hệ thống máy ảnh chuyên nghiệp.',
            link: '../#albumSection',
            linkLabel: 'Xem bộ sưu tập',
            media: [{ url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80' }]
        },
        {
            id: 'default-giai-tri',
            title: 'Vlog & Nội dung giải trí tổng hợp',
            category: 'giai-tri',
            description: 'Các video trải nghiệm, hậu trường thú vị và các câu chuyện đời thường.',
            link: 'https://www.facebook.com/n.giang62/reels/',
            linkLabel: 'Xem trên Facebook',
            media: [{ url: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=1200&q=80' }]
        },
        {
            id: 'default-thoi-trang',
            title: 'Lookbook & Bộ sưu tập thời trang',
            category: 'thoi-trang',
            description: 'Dự án phối cảnh, chụp lookbook và định hình phong cách cá tính.',
            link: '',
            linkLabel: '',
            media: [{ url: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80' }]
        },
        {
            id: 'default-tvc',
            title: 'Sản xuất TVC & Quảng cáo thương hiệu',
            category: 'tvc',
            description: 'Các thước phim quảng cáo doanh nghiệp, sự kiện và truyền thông chuyên nghiệp.',
            link: '',
            linkLabel: '',
            media: [{ url: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80' }]
        },
        {
            id: 'default-video-beauty',
            title: 'Review & Video Beauty Sản phẩm',
            category: 'video-beauty',
            description: 'Quay dựng chi tiết cận cảnh sản phẩm, mỹ phẩm và công nghệ với ánh sáng Studio.',
            link: '',
            linkLabel: '',
            media: [{ url: 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=1200&q=80' }]
        }
    ].map(duanNormalizeProject).filter(Boolean);
}

function duanProjectById(id) {
    return duanProjects.find(p => p.id === id) || null;
}

// ==================== THƯ MỤC CLOUDINARY THEO TỪNG DỰ ÁN ====================
// Tiêu đề tiếng Việt → slug không dấu dùng làm tên thư mục: "Bộ sưu tập nhiếp ảnh" → bo-suu-tap-nhiep-anh
function duanSlug(text) {
    return String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')      // bỏ dấu thanh (á, ệ, ữ…)
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60)
        .replace(/-+$/g, '');
}

// Thư mục Cloudinary của 1 dự án: `du-an/<slug-tiêu-đề>` (dự phòng: slug theo id, cuối cùng là chua-dat-ten)
function duanProjectFolder(project) {
    if (!DUAN_FOLDER_PER_PROJECT) return DUAN_CLOUDINARY_FOLDER;
    const name = duanSlug(project && project.title) ||
        duanSlug(project && project.id) ||
        'chua-dat-ten';
    return DUAN_CLOUDINARY_FOLDER ? DUAN_CLOUDINARY_FOLDER + '/' + name : name;
}

// Thư mục dùng khi đang thêm media TRONG FORM: theo dự án đang sửa, hoặc theo tiêu đề đang gõ (dự án mới)
function duanFormTargetFolder() {
    if (duanFormEditId) {
        const project = duanProjectById(duanFormEditId);
        if (project) return duanProjectFolder(project);
    }
    const titleInput = duanEl('duanFormTitleInput');
    return duanProjectFolder({ title: titleInput ? titleInput.value : '', id: duanFormDraftId });
}

// Hiện trong form: ảnh/video sắp tải lên sẽ nằm ở thư mục nào trên Cloudinary
function duanRenderFormFolderHint() {
    const hint = duanEl('duanFormFolderHint');
    if (!hint) return;
    hint.textContent = 'Thư mục Cloudinary: ' + duanFormTargetFolder() +
        (DUAN_FOLDER_PER_PROJECT ? '  (mỗi dự án một thư mục riêng)' : '');
}

// Preset "Fixed folder" sẽ khiến Cloudinary bỏ qua thư mục gửi kèm → cảnh báo 1 lần cho admin biết
let duanWarnedFolderMismatch = false;
function duanCheckUploadFolder(data, targetFolder) {
    if (duanWarnedFolderMismatch || !DUAN_FOLDER_PER_PROJECT || !targetFolder) return;
    const landed = String((data && (data.asset_folder || data.folder)) || '').replace(/\/+$/, '');
    if (!landed || landed === targetFolder) return;
    duanWarnedFolderMismatch = true;
    console.warn('Cloudinary xếp media vào "' + landed + '" thay vì "' + targetFolder +
        '": upload preset đang cố định Folder. Đổi preset sang Folder = Dynamic để chia thư mục theo dự án.');
    duanToast('⚠ Media vào "' + landed + '" thay vì "' + targetFolder + '": preset Cloudinary đang cố định Folder — đổi sang Dynamic để chia thư mục theo dự án', false);
}

// Admin sửa/xoá danh mục MẶC ĐỊNH → các mục đó thành dữ liệu thật để lần lưu sau ghi vào store
function duanMaterialize() {
    if (duanProjectsSource === 'default') duanProjectsSource = 'store';
}
// ==================== ĐỌC DỮ LIỆU (SERVER → CLOUD → OFFLINE) ====================
let duanWarnedMissingProjects = false;

async function duanLoadStore() {
    // 1) Server mini PC (chỉ thử khi trang được phục vụ qua http/https)
    if (/^https?:$/i.test(window.location.protocol)) {
        try {
            const res = await fetch('/api/data', { cache: 'no-store' });
            if (res.ok) { duanApplyStore(await res.json(), 'server'); return; }
        } catch (err) { /* không có server → thử cloud */ }
        // 2) Cloud: đọc qua proxy Cloudflare (khoá jsonbin nằm ở phía Worker)
        if (DUAN_PROXY_URL) {
            try {
                const res = await fetch(DUAN_PROXY_URL.replace(/\/+$/, '') + '/data', { cache: 'no-store' });
                if (res.ok) {
                    const payload = await res.json();
                    duanApplyStore(payload && payload.record ? payload.record : payload, 'cloud');
                    return;
                }
            } catch (err) { /* mất mạng → dùng bản cục bộ */ }
        }
    }
    // 3) Offline: dữ liệu từ data.js cùng thư mục gốc (đã nạp bằng <script src="../data.js">)
    duanApplyStore(window.SITE_DATA || {}, 'offline');
}

function duanApplyStore(record, mode) {
    duanMode = mode;
    duanFullStore = (record && typeof record === 'object' && !Array.isArray(record)) ? record : {};
    let projects = duanNormalizeProjects(duanFullStore);
    // Offline: data.js chưa có dự án mà máy này vừa lưu bản tạm → dùng bản tạm để không mất thao tác
    if (!projects && mode === 'offline') {
        const backup = duanReadBackup();
        if (backup) projects = backup;
    }
    if (!projects) {
        duanProjects = duanDefaultProjects();
        duanProjectsSource = 'default';
    } else {
        duanProjects = projects;
        duanProjectsSource = 'store';
    }
    duanRenderAll();
}

function duanWriteBackup() {
    try {
        localStorage.setItem(DUAN_BACKUP_KEY, JSON.stringify(duanProjects));
        sessionStorage.setItem(DUAN_DIRTY_KEY, '1');
    } catch (err) { console.warn('Không ghi được bản tạm dự án:', err); }
}

function duanClearDirty() {
    try { sessionStorage.removeItem(DUAN_DIRTY_KEY); } catch (err) {}
}

function duanReadBackup() {
    try {
        const raw = localStorage.getItem(DUAN_BACKUP_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return null;
        return parsed.map(duanNormalizeProject).filter(Boolean);
    } catch (err) { return null; }
}

// ==================== LƯU DỮ LIỆU ====================
function duanPersist(okMessage) {
    const task = duanSaveQueue.then(() => duanSaveNow(okMessage)).catch(err => {
        console.warn('Lưu dự án thất bại:', err);
        duanToast('⚠ ' + (err && err.message ? err.message : 'Không lưu được dự án'), false);
    });
    duanSaveQueue = task.catch(() => {});
    return duanSaveQueue;
}

async function duanSaveNow(okMessage) {
    if (!duanIsAdmin()) throw new Error('Cần đăng nhập quyền admin để lưu thay đổi');
    // Ghi vào store: null = đang dùng danh mục mặc định, mảng = dữ liệu thật của admin
    duanFullStore.projects = duanProjectsSource === 'default' ? null : duanProjects;
    duanWriteBackup();

    if (duanMode === 'server') {
        const res = await fetch('/api/data', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(duanFullStore)
        });
        if (!res.ok) throw new Error('Máy chủ /api/data trả về ' + res.status);
        let saved = null;
        try { saved = await res.json(); } catch (err) {}
        if (saved && typeof saved === 'object' && Array.isArray(saved.projects)) duanFullStore = saved;
        else duanWarnServerMissingProjects();
        duanClearDirty();
        duanToast(okMessage || '✓ Đã lưu dự án lên máy chủ', true);
        return;
    }

    if (duanMode === 'cloud' && DUAN_PROXY_URL) {
        if (!duanIdToken) throw new Error('Phiên đăng nhập đã hết hạn — hãy đăng nhập lại');
        const res = await fetch(DUAN_PROXY_URL.replace(/\/+$/, '') + '/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Google-Token': duanIdToken },
            body: JSON.stringify({ store: duanFullStore })
        });
        let payload = null;
        try { payload = await res.json(); } catch (err) {}
        if (!res.ok) throw new Error((payload && payload.error) || ('Proxy trả về ' + res.status));
        const record = payload && payload.record ? payload.record : null;
        if (record && typeof record === 'object' && Array.isArray(record.projects)) duanFullStore = record;
        else duanWarnServerMissingProjects();
        duanClearDirty();
        duanToast(okMessage || '✓ Đã lưu dự án lên cloud', true);
        return;
    }

    // Offline (file://) → ghi thẳng ../data.js hoặc tải file về để thay thủ công
    const result = await duanWriteDataFile();
    if (result === 'saved') {
        duanClearDirty();
        duanToast((okMessage ? okMessage + ' ' : '✓ ') + 'đã ghi vào data.js', true);
    } else if (result === 'cancelled') {
        duanToast('Đã huỷ lưu dự án', false);
    } else {
        duanToast('⚠ Chưa tự lưu được — đã tải file data.js, bạn thay vào thư mục trang nhé', false);
    }
}

function duanWarnServerMissingProjects() {
    if (duanWarnedMissingProjects) return;
    duanWarnedMissingProjects = true;
    console.warn('Nguồn dữ liệu không trả về khoá `projects` — kiểm tra server.js: khi ghi /api/data phải lưu nguyên JSON (kèm khoá projects) vào data.js.');
    duanToast('⚠ Dự án đã gửi nhưng nơi lưu chưa trả về danh sách — kiểm tra server.js / data.js', false);
}
// ==================== GHI FILE ../data.js KHI CHẠY OFFLINE (file://) ====================
// Dùng File System Access API + lưu handle trong IndexedDB (chung DB với app.js) nên cả hai trang
// cùng trỏ về một file data.js, không phải chọn lại đường dẫn nhiều lần.
function duanBuildDataPayload() {
    return 'window.SITE_DATA = ' + JSON.stringify(duanFullStore, null, 2) + ';';
}

function duanOpenHandleStore() {
    return new Promise((resolve, reject) => {
        let req;
        try { req = indexedDB.open('giang_file_handle', 1); } catch (err) { reject(err); return; }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function duanKeepFileHandle(handle) {
    const db = await duanOpenHandleStore();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(handle, DUAN_DATA_FILE_NAME);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

async function duanReadStoredFileHandle() {
    const db = await duanOpenHandleStore();
    return new Promise(resolve => {
        const tx = db.transaction('handles', 'readonly');
        const get = tx.objectStore('handles').get(DUAN_DATA_FILE_NAME);
        get.onsuccess = () => { db.close(); resolve(get.result || null); };
        get.onerror = () => { db.close(); resolve(null); };
    });
}

function duanDownloadDataFile(payload) {
    const blob = new Blob([payload], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = DUAN_DATA_FILE_NAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Kết quả: 'saved' | 'cancelled' | 'unsupported' | 'error'
async function duanWriteDataFile() {
    const payload = duanBuildDataPayload();
    let handle = null;
    try { handle = await duanReadStoredFileHandle(); } catch (err) { handle = null; }
    if (!handle) {
        if (!window.showSaveFilePicker) { duanDownloadDataFile(payload); return 'unsupported'; }
        try {
            handle = await window.showSaveFilePicker({
                suggestedName: DUAN_DATA_FILE_NAME,
                types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
            });
        } catch (err) { return 'cancelled'; }
    }
    try {
        const writable = await handle.createWritable();
        await writable.write(payload);
        await writable.close();
        if (window.showSaveFilePicker) duanKeepFileHandle(handle).catch(() => {});
        return 'saved';
    } catch (err) {
        duanDownloadDataFile(payload);
        return 'error';
    }
}
// ==================== ĐĂNG NHẬP GOOGLE & QUYỀN ADMIN ====================
function duanClientConfigured() {
    return !!DUAN_GOOGLE_CLIENT_ID && DUAN_GOOGLE_CLIENT_ID.indexOf('thay-bang') !== 0;
}

// Chỉ email trong DUAN_ADMIN_EMAILS mới thấy công cụ thêm/sửa/xoá (giống app.js của trang chủ)
function duanIsAdmin() {
    return !!(duanGoogleUser && duanGoogleUser.email &&
        DUAN_ADMIN_EMAILS.indexOf(String(duanGoogleUser.email).toLowerCase()) !== -1);
}

function duanEnsureAdmin() {
    if (duanIsAdmin()) return true;
    duanToast('⚠ Hãy đăng nhập bằng tài khoản quản trị (admin) để thực hiện', false);
    return false;
}

function duanDecodeJwtPayload(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(atob(base64).split('').map(c =>
            '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        return JSON.parse(json);
    } catch (err) {
        console.warn('Không giải mã được token Google:', err);
        return null;
    }
}

function duanSaveSession(user) {
    try {
        if (user) sessionStorage.setItem(DUAN_SESSION_KEY, JSON.stringify(user));
        else sessionStorage.removeItem(DUAN_SESSION_KEY);
    } catch (err) { console.warn('Không lưu được phiên Google:', err); }
}

function duanLoadSession() {
    try {
        const raw = sessionStorage.getItem(DUAN_SESSION_KEY);
        if (!raw) return null;
        const saved = JSON.parse(raw);
        duanIdToken = saved && saved.idToken ? saved.idToken : null;
        // ID token Google sống ~1 giờ. Ghi dữ liệu qua proxy BẮT BUỘC có token hợp lệ,
        // nên phiên hết hạn coi như chưa đăng nhập (tránh bấm lưu rồi mới báo lỗi 401).
        const expMs = saved && saved.exp ? Number(saved.exp) * 1000 : 0;
        if (!duanIdToken || !expMs || expMs < Date.now()) { duanIdToken = null; return null; }
        return saved;
    } catch (err) { return null; }
}

function duanHandleCredential(response) {
    const payload = duanDecodeJwtPayload(response.credential);
    if (!payload) return;
    duanGoogleUser = {
        name: payload.name || payload.email || 'Người dùng Google',
        email: payload.email || '',
        picture: payload.picture || '',
        sub: payload.sub || '',
        exp: payload.exp || 0
    };
    duanIdToken = response.credential || null;
    duanSaveSession(Object.assign({}, duanGoogleUser, { idToken: duanIdToken }));
    duanUpdateAuthUI();
    duanToast('✓ Đã đăng nhập: ' + duanGoogleUser.name + (duanIsAdmin() ? ' (Admin)' : ''), true);
}

function duanSignOut() {
    try { google.accounts.id.disableAutoSelect(); } catch (err) {}
    duanGoogleUser = null;
    duanIdToken = null;
    duanSaveSession(null);
    duanUpdateAuthUI();
    duanToast('Đã đăng xuất', true);
}

function duanUpdateAuthUI() {
    const box = duanEl('duanAuthBox');
    const signedOut = duanEl('duanAuthSignedOut');
    const signedIn = duanEl('duanAuthSignedIn');
    const loggedIn = !!duanGoogleUser;
    const configured = duanClientConfigured();

    if (box) { box.classList.toggle('hidden', !configured); box.classList.toggle('flex', configured); }
    if (signedOut) signedOut.classList.toggle('hidden', loggedIn);
    if (signedIn) { signedIn.classList.toggle('hidden', !loggedIn); signedIn.classList.toggle('flex', loggedIn); }

    // Chưa đăng nhập mà nút Google không vẽ được (thường do mở trang bằng file://) → nhắc rõ cách khắc phục
    const note = duanEl('duanAuthNote');
    if (note) {
        const showNote = !loggedIn && configured && !duanAuthReady;
        note.classList.toggle('hidden', !showNote);
        if (showNote) note.textContent = 'Chưa hiển thị được nút Google — hãy mở trang qua http/https (không mở bằng file://) để đăng nhập quản trị.';
    }

    if (loggedIn) {
        const avatar = duanEl('duanUserAvatar');
        const name = duanEl('duanUserName');
        const badge = duanEl('duanAdminBadge');
        const hint = duanEl('duanAuthHint');
        if (avatar) avatar.src = duanGoogleUser.picture || '';
        if (name) name.textContent = duanGoogleUser.name || duanGoogleUser.email || '';
        if (badge) badge.classList.toggle('hidden', !duanIsAdmin());
        if (hint) {
            hint.textContent = duanIsAdmin() ? '' : 'Tài khoản này không có quyền quản trị';
            hint.classList.toggle('hidden', duanIsAdmin());
        }
    }
    duanRenderAdminTools();
}

function duanSetupGoogleAuth() {
    duanGoogleUser = duanLoadSession();
    if (!duanClientConfigured()) { duanUpdateAuthUI(); return; }
    if (!window.google || !google.accounts || !google.accounts.id) {
        // Thư viện GIS chưa tải xong → thử lại tối đa ~5 giây
        duanSetupGoogleAuth.tries = (duanSetupGoogleAuth.tries || 0) + 1;
        if (duanSetupGoogleAuth.tries <= 20) setTimeout(duanSetupGoogleAuth, 250);
        else duanUpdateAuthUI();
        return;
    }
    google.accounts.id.initialize({
        client_id: DUAN_GOOGLE_CLIENT_ID,
        callback: duanHandleCredential,
        auto_select: false
    });
    const btn = duanEl('duanGoogleBtn');
    if (btn) {
        google.accounts.id.renderButton(btn, {
            theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi', width: 220
        });
    }
    duanAuthReady = true;
    duanUpdateAuthUI();
}
// ==================== RENDER: THỐNG KÊ – TAB – LƯỚI DỰ ÁN ====================
function duanRenderAll() {
    duanRenderStats();
    duanRenderTabs();
    duanRenderGrid();
    duanRenderAdminTools();
    if (duanOpenProjectId && duanProjectById(duanOpenProjectId)) duanRenderProjectModal(duanOpenProjectId);
    // Cố ý KHÔNG đụng tới form đang mở để không mất nội dung người dùng đang nhập
}

function duanRenderStats() {
    const wrap = duanEl('duanStats');
    if (!wrap) return;
    const counts = duanMediaCounts(duanProjects.flatMap(p => p.media));
    const categories = new Set(duanProjects.map(p => p.category)).size;
    const rows = [
        ['Dự án', duanProjects.length],
        ['Ảnh', counts.image],
        ['Video', counts.video],
        ['Danh mục', categories]
    ];
    wrap.innerHTML = rows.map(row =>
        '<div class="duan-stat"><b>' + row[1] + '</b><span>' + duanEscape(row[0]) + '</span></div>').join('');
}

function duanRenderTabs() {
    const wrap = duanEl('duanTabs');
    if (!wrap) return;
    const counts = { all: duanProjects.length };
    DUAN_CATEGORIES.forEach(c => { counts[c.key] = duanProjects.filter(p => p.category === c.key).length; });
    if (duanCategory !== 'all' && !counts[duanCategory]) duanCategory = 'all';

    const items = [{ key: 'all', label: 'Tất cả' }].concat(DUAN_CATEGORIES.filter(c => counts[c.key] > 0));
    wrap.innerHTML = items.map(item =>
        '<button type="button" class="tab-btn duan-tab' + (duanCategory === item.key ? ' active' : '') + '" data-duan-cat="' + item.key + '">' +
        duanEscape(item.label) + '<span class="duan-tab-count">' + (counts[item.key] || 0) + '</span></button>').join('');
}

function duanRenderGrid() {
    const grid = duanEl('duanGrid');
    const empty = duanEl('duanEmpty');
    if (!grid) return;
    const list = duanCategory === 'all' ? duanProjects : duanProjects.filter(p => p.category === duanCategory);
    if (empty) empty.classList.toggle('hidden', list.length > 0);
    grid.innerHTML = list.map((project, index) => duanCardHtml(project, index)).join('');
}
// Thẻ dự án: bìa tự chọn khung dọc/ngang theo media đầu tiên + badge danh mục + số lượng ảnh/video
function duanCardHtml(project, index) {
    const cat = duanCategoryInfo(project.category);
    const coverItem = project.media.length ? project.media[0] : null;
    const cover = coverItem ? duanDetectMedia(coverItem.url) : null;
    const counts = duanMediaCounts(project.media);
    const playable = !!(cover && cover.type !== 'image');
    const coverSrc = cover && cover.thumb ? cover.thumb : '';
    // Bìa dọc (9:16) → khung dọc 4/5; bìa ngang → khung ngang 16/9
    const coverPortrait = coverItem ? duanMediaOrientation(coverItem) === 'portrait' : false;
    const coverProbe = coverItem ? duanRatioProbeAttrs(coverItem) : '';
    // 3 bìa đầu nằm trong màn hình đầu tiên → tải ngay; phần còn lại để trình duyệt lazy-load
    const loadingAttr = index < 3 ? '' : ' loading="lazy"';

    const meta = [];
    if (counts.image) meta.push('<span class="duan-chip"><i class="ph ph-image" aria-hidden="true"></i> ' + counts.image + ' ảnh</span>');
    if (counts.video) meta.push('<span class="duan-chip"><i class="ph ph-video-camera" aria-hidden="true"></i> ' + counts.video + ' video</span>');
    if (!project.media.length) meta.push('<span class="duan-chip"><i class="ph ph-hourglass-medium" aria-hidden="true"></i> Chưa có ảnh/video</span>');

    return '' +
    '<article class="glass-card duan-card project-card" data-category="' + duanEscape(cat.key) + '">' +
        '<button type="button" class="duan-cover' + (coverPortrait ? ' is-portrait' : '') + '" data-duan-open="' + duanEscape(project.id) + '"' +
            (coverItem ? ' data-duan-media="' + duanRatioKey(coverItem.url) + '"' : '') +
            ' aria-label="Xem dự án ' + duanEscape(project.title) + '">' +
            '<span class="duan-cover-placeholder"><i class="ph ' + (playable ? 'ph-film-slate' : 'ph-image') + '" aria-hidden="true"></i></span>' +
            (coverSrc ? '<img src="' + duanEscape(coverSrc) + '" alt="' + duanEscape(project.title) + '"' + loadingAttr + ' decoding="async"' + coverProbe + ' onerror="this.remove()">' : '') +
            '<span class="duan-cover-shade"></span>' +
            '<span class="duan-cover-tags"><span class="duan-badge ' + cat.color + '">' + duanEscape(cat.label) + '</span></span>' +
            (playable ? '<span class="duan-play"><i class="ph-fill ph-play-circle" aria-hidden="true"></i></span>' : '') +
            '<span class="duan-cover-meta">' + meta.join('') + '</span>' +
        '</button>' +
        '<div class="duan-card-body">' +
            '<h2 class="duan-proj-title">' + duanEscape(project.title) + '</h2>' +
            '<p class="duan-desc duan-clamp-3">' + duanEscape(project.description || 'Chưa có mô tả cho dự án này.') + '</p>' +
        '</div>' +
        '<div class="duan-card-foot">' +
            '<button type="button" class="duan-btn duan-btn--primary duan-grow" data-duan-open="' + duanEscape(project.id) + '">' +
                '<i class="ph ph-eye" aria-hidden="true"></i> Xem dự án</button>' +
            (project.link
                ? '<a class="duan-btn duan-btn--ghost" href="' + duanEscape(duanCleanLink(project.link)) + '" target="_blank" rel="noopener noreferrer" title="' + duanEscape(project.linkLabel || 'Mở liên kết') + '"><i class="ph ph-arrow-square-out" aria-hidden="true"></i></a>'
                : '') +
        '</div>' +
    '</article>';
}

// Hiện/ẩn công cụ quản trị + cho admin biết thay đổi đang được lưu ở đâu
function duanRenderAdminTools() {
    const admin = duanIsAdmin();

    const tools = duanEl('duanAdminTools');
    if (tools) { tools.classList.toggle('hidden', !admin); tools.classList.toggle('flex', admin); }

    const note = duanEl('duanDefaultNote');
    if (note) note.classList.toggle('hidden', !(admin && duanProjectsSource === 'default'));

    const projectTools = duanEl('duanProjectAdminTools');
    const showProjectTools = admin && !!duanOpenProjectId;
    if (projectTools) {
        projectTools.classList.toggle('hidden', !showProjectTools);
        projectTools.classList.toggle('flex', showProjectTools);
    }

    const chip = duanEl('duanModeChip');
    if (chip) {
        chip.textContent = duanMode === 'server' ? 'Lưu: máy chủ mini PC'
            : (duanMode === 'cloud' ? 'Lưu: cloud (jsonbin)' : 'Lưu: file data.js trên máy');
        chip.classList.toggle('hidden', !admin);
    }

    // Ô chọn dự án nhận ảnh/video tải lên (giống album: chọn album rồi bấm Tải ảnh lên)
    duanRenderQuickTarget();
}
// ==================== XEM DỰ ÁN: ẢNH / VIDEO ====================
function duanOpenProject(id) {
    const project = duanProjectById(id);
    if (!project) return;
    if (!duanOpenProjectId) duanFocusedBefore = document.activeElement;
    duanOpenProjectId = id;
    duanViewIndex = 0;
    duanRenderProjectModal(id);
    const modal = duanEl('duanProjectModal');
    duanShow(modal);
    document.body.style.overflow = 'hidden';
    duanFocusFirst(modal);
}

function duanCloseProject() {
    duanHide(duanEl('duanProjectModal'));
    duanOpenProjectId = null;
    if (!duanIsFormOpen() && !duanIsLightboxOpen()) document.body.style.overflow = '';
    duanRestoreFocus();
    duanRenderAdminTools();
}

function duanCurrentProject() {
    return duanOpenProjectId ? duanProjectById(duanOpenProjectId) : null;
}

function duanRenderProjectModal(id) {
    const project = duanProjectById(id);
    if (!project) return;
    const cat = duanCategoryInfo(project.category);
    const counts = duanMediaCounts(project.media);

    const titleEl = duanEl('duanProjectTitle');
    if (titleEl) titleEl.textContent = project.title;

    const metaEl = duanEl('duanProjectMeta');
    if (metaEl) {
        const parts = [cat.label];
        if (counts.image) parts.push(counts.image + ' ảnh');
        if (counts.video) parts.push(counts.video + ' video');
        if (!project.media.length) parts.push('chưa có ảnh/video');
        metaEl.textContent = parts.join(' · ');
    }

    const descEl = duanEl('duanProjectDesc');
    if (descEl) descEl.textContent = project.description || '';

    const linkEl = duanEl('duanProjectLink');
    const linkTextEl = duanEl('duanProjectLinkText');
    if (linkEl) {
        const href = project.link ? duanCleanLink(project.link) : '';
        linkEl.classList.toggle('hidden', !href);
        if (href) linkEl.href = href;
        if (linkTextEl) linkTextEl.textContent = project.linkLabel || 'Mở liên kết';
    }

    // Admin: cho biết ảnh/video của dự án này nằm ở thư mục nào trên Cloudinary
    const folderChip = duanEl('duanProjectFolderChip');
    if (folderChip) {
        folderChip.textContent = 'Cloudinary: ' + duanProjectFolder(project);
        folderChip.classList.toggle('hidden', !duanIsAdmin());
    }

    duanRenderAdminTools();
    duanRenderViewer(project);
    duanRenderThumbs(project);
}

// Khung xem: mỗi lần chỉ nạp ĐÚNG media đang chọn (ảnh nhẹ / video preload=metadata / iframe theo yêu cầu)
function duanRenderViewer(project) {
    const viewer = duanEl('duanViewer');
    if (!viewer) return;
    const list = project ? project.media : [];
    const counter = duanEl('duanViewerCounter');
    const typeChip = duanEl('duanViewerType');

    if (!list.length) {
        viewer.innerHTML = '<div class="duan-viewer-empty"><i class="ph ph-image-square" style="font-size:2rem" aria-hidden="true"></i><span>Dự án chưa có ảnh/video</span></div>';
        viewer.classList.remove('is-portrait');
        delete viewer.dataset.duanMedia;
        if (counter) counter.textContent = '';
        if (typeChip) typeChip.classList.add('hidden');
        duanToggleViewerNav(false);
        return;
    }

    duanViewIndex = Math.min(Math.max(0, duanViewIndex), list.length - 1);
    const item = list[duanViewIndex];
    const media = duanDetectMedia(item.url);
    if (!media) return;

    // Khung xem đổi theo tỉ lệ: media dọc → khung dọc 9/16; media ngang → khung ngang 16/9.
    // Nếu chưa biết tỉ lệ thì tạm ngang và tự đổi ngay khi ảnh/video tải xong (duanMeasureRatio).
    viewer.dataset.duanMedia = duanRatioKey(item.url);
    viewer.classList.toggle('is-portrait', duanMediaOrientation(item) === 'portrait');
    const probe = duanRatioProbeAttrs(item);

    if (media.type === 'image') {
        viewer.innerHTML = '<img src="' + duanEscape(duanThumbUrl(media.url, DUAN_THUMB_WIDTH.viewer)) + '" alt="' +
            duanEscape(project.title) + ' - ảnh ' + (duanViewIndex + 1) + '" data-duan-zoom="1"' + probe + ' onerror="this.remove()">';
    } else if (media.type === 'video') {
        viewer.innerHTML = '<video src="' + duanEscape(media.url) + '" controls playsinline preload="metadata"' +
            (media.thumb ? ' poster="' + duanEscape(media.thumb) + '"' : '') + probe + '></video>';
    } else {
        viewer.innerHTML = '<iframe src="' + duanEscape(media.embedUrl) + '" title="' + duanEscape(project.title) +
            '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    }

    if (counter) counter.textContent = (duanViewIndex + 1) + '/' + list.length;
    if (typeChip) {
        typeChip.textContent = media.type === 'image' ? 'Ảnh' : (media.type === 'video' ? 'Video' : 'Video nhúng');
        if (media.provider) typeChip.textContent += ' · ' + media.provider;
        typeChip.classList.remove('hidden');
    }
    duanToggleViewerNav(list.length > 1);
    duanHighlightActiveThumb();
}
function duanToggleViewerNav(show) {
    document.querySelectorAll('#duanProjectModal .duan-nav').forEach(btn => btn.classList.toggle('hidden', !show));
}

function duanViewStep(delta) {
    const project = duanCurrentProject();
    if (!project || project.media.length < 2) return;
    duanViewIndex = (duanViewIndex + delta + project.media.length) % project.media.length;
    duanRenderViewer(project);
}

// Dải thumbnail: ảnh nhỏ (Cloudinary đã tối ưu) + nhãn loại media.
// Admin thấy thêm 2 nút ngay trên mỗi ô (đặt bìa / xoá) — giống nút tải xuống + xoá trong album ảnh.
// LƯU Ý: công cụ phải nằm NGOÀI thẻ <button> của thumbnail (HTML không cho lồng button trong button).
function duanRenderThumbs(project) {
    const wrap = duanEl('duanThumbs');
    if (!wrap) return;
    const list = project ? project.media : [];
    const admin = duanIsAdmin();
    wrap.innerHTML = list.map((item, index) => {
        const media = duanDetectMedia(item.url);
        if (!media) return '';
        const label = media.type === 'image' ? 'ẢNH' : (media.type === 'video' ? 'VIDEO' : String(media.provider || 'VIDEO').toUpperCase());
        const icon = media.type === 'image' ? 'ph-image' : 'ph-play';
        // Thumbnail dọc → ô dọc 9/16; ngang → ô ngang. Chưa biết tỉ lệ thì tự đo khi ảnh tải xong.
        const portrait = duanMediaOrientation(item) === 'portrait';
        const probe = duanRatioProbeAttrs(item);
        const tools = admin ? '<span class="duan-thumb-tools">' +
            (index > 0 ? '<button type="button" class="duan-thumb-btn" data-duan-thumb-cover="' + index + '" title="Đặt làm ảnh bìa"><i class="ph ph-image-square" aria-hidden="true"></i></button>' : '') +
            '<button type="button" class="duan-thumb-btn duan-thumb-btn--del" data-duan-thumb-del="' + index + '" title="Xoá khỏi dự án"><i class="ph ph-trash" aria-hidden="true"></i></button>' +
        '</span>' : '';
        return '<div class="duan-thumb-cell">' +
            '<button type="button" class="duan-thumb' + (index === duanViewIndex ? ' is-active' : '') + (portrait ? ' is-portrait' : '') +
                '" data-duan-thumb="' + index + '" data-duan-media="' + duanRatioKey(item.url) + '" aria-label="Xem ' + duanEscape(label) + ' ' + (index + 1) + '">' +
                '<span class="duan-thumb-icon"><i class="ph ' + icon + '" aria-hidden="true"></i></span>' +
                (media.thumb ? '<img src="' + duanEscape(media.thumb) + '" alt="" loading="lazy" decoding="async"' + probe + ' onerror="this.remove()">' : '') +
                '<span class="duan-thumb-tag">' + duanEscape(label) + '</span>' +
            '</button>' + tools +
        '</div>';
    }).join('');
}

function duanHighlightActiveThumb() {
    document.querySelectorAll('#duanThumbs .duan-thumb').forEach(btn => {
        const active = Number(btn.dataset.duanThumb) === duanViewIndex;
        btn.classList.toggle('is-active', active);
        if (active && typeof btn.scrollIntoView === 'function') {
            btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        }
    });
}

// ==================== LIGHTBOX PHÓNG TO ẢNH ====================
function duanOpenLightbox() {
    const project = duanCurrentProject();
    if (!project) return;
    const images = project.media.filter(m => (duanDetectMedia(m.url) || {}).type === 'image');
    if (!images.length) { duanToast('Dự án này chưa có ảnh để phóng to', false); return; }
    duanLightboxList = images;
    const current = project.media[duanViewIndex];
    const found = current ? images.findIndex(m => m.url === current.url) : 0;
    duanLightboxIndex = found === -1 ? 0 : found;
    duanRenderLightbox();
    duanShow(duanEl('duanLightbox'));
    document.body.style.overflow = 'hidden';
    duanFocusFirst(duanEl('duanLightbox'));
}

function duanRenderLightbox() {
    const img = duanEl('duanLightboxImg');
    const caption = duanEl('duanLightboxCaption');
    const item = duanLightboxList[duanLightboxIndex];
    if (!img || !item) return;
    img.src = duanThumbUrl(item.url, DUAN_THUMB_WIDTH.viewer);
    img.alt = 'Ảnh ' + (duanLightboxIndex + 1);
    if (caption) caption.textContent = (duanLightboxIndex + 1) + '/' + duanLightboxList.length;
    document.querySelectorAll('#duanLightbox .duan-nav').forEach(btn => btn.classList.toggle('hidden', duanLightboxList.length < 2));
    // Nạp trước ảnh kế bên để bấm chuyển là hiện ngay
    if (duanLightboxList.length > 1) {
        const next = duanLightboxList[(duanLightboxIndex + 1) % duanLightboxList.length];
        if (next) { const preload = new Image(); preload.src = duanThumbUrl(next.url, DUAN_THUMB_WIDTH.viewer); }
    }
}

function duanLightboxStep(delta) {
    if (duanLightboxList.length < 2) return;
    duanLightboxIndex = (duanLightboxIndex + delta + duanLightboxList.length) % duanLightboxList.length;
    duanRenderLightbox();
}

function duanCloseLightbox() {
    duanHide(duanEl('duanLightbox'));
    if (!duanIsFormOpen()) document.body.style.overflow = duanOpenProjectId ? 'hidden' : '';
    duanRestoreFocus();
}

// ==================== TIỆN ÍCH MODAL (focus & trạng thái) ====================
function duanIsFormOpen() {
    const modal = duanEl('duanFormModal');
    return !!(modal && !modal.classList.contains('hidden'));
}

function duanIsLightboxOpen() {
    const modal = duanEl('duanLightbox');
    return !!(modal && !modal.classList.contains('hidden'));
}

function duanFocusFirst(modal) {
    if (!modal) return;
    const target = modal.querySelector('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
    if (target) target.focus();
}

function duanRestoreFocus() {
    const el = duanFocusedBefore;
    duanFocusedBefore = null;
    if (el && typeof el.focus === 'function') el.focus();
}

function duanTrapFocus(event, modal) {
    if (event.key !== 'Tab' || !modal) return;
    const nodes = modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}
// ==================== THÊM / SỬA DỰ ÁN (chỉ admin) ====================
function duanSetupCategoryOptions() {
    const select = duanEl('duanFormCategory');
    if (!select) return;
    select.innerHTML = DUAN_CATEGORIES.map(c =>
        '<option value="' + duanEscape(c.key) + '">' + duanEscape(c.label) + '</option>').join('');
}

function duanOpenForm(id, focusMedia) {
    if (!duanEnsureAdmin()) return;
    const project = id ? duanProjectById(id) : null;
    duanFormEditId = project ? project.id : null;
    // Dự án mới: chuẩn bị id trước để dùng làm tên thư mục Cloudinary khi tiêu đề còn trống
    duanFormDraftId = project ? '' : duanNewId();
    duanFormMedia = project ? project.media.map(m => ({ url: m.url, w: m.w, h: m.h })) : [];

    const heading = duanEl('duanFormHeading');
    if (heading) heading.textContent = project ? 'Sửa dự án' : 'Thêm dự án';
    const titleInput = duanEl('duanFormTitleInput');
    if (titleInput) titleInput.value = project ? project.title : '';
    const catSelect = duanEl('duanFormCategory');
    if (catSelect) catSelect.value = project ? project.category : DUAN_CATEGORIES[0].key;
    const descInput = duanEl('duanFormDesc');
    if (descInput) descInput.value = project ? project.description : '';
    const linkInput = duanEl('duanFormLink');
    if (linkInput) linkInput.value = project ? project.link : '';
    const linkLabelInput = duanEl('duanFormLinkLabel');
    if (linkLabelInput) linkLabelInput.value = project ? project.linkLabel : '';
    const status = duanEl('duanMediaStatus');
    if (status) status.textContent = '';
    const urlInput = duanEl('duanUrlInput');
    if (urlInput) urlInput.value = '';

    duanRenderFormMedia();
    duanRenderFormFolderHint();
    if (!duanIsFormOpen()) duanFocusedBefore = document.activeElement;
    duanShow(duanEl('duanFormModal'));
    document.body.style.overflow = 'hidden';
    // Mở từ nút "Ảnh/Video" của một dự án → đặt con trỏ sẵn ở ô dán link cho nhanh
    const focusTarget = focusMedia ? duanEl('duanUrlInput') : titleInput;
    if (focusTarget) setTimeout(() => focusTarget.focus(), 30);
    else duanFocusFirst(duanEl('duanFormModal'));
}

function duanCloseForm() {
    duanHide(duanEl('duanFormModal'));
    duanFormEditId = null;
    duanFormDraftId = '';
    duanFormMedia = [];
    if (!duanIsLightboxOpen()) document.body.style.overflow = duanOpenProjectId ? 'hidden' : '';
    duanRestoreFocus();
}
// Danh sách ảnh/video đang soạn trong form (chưa lưu) — có nút đặt bìa, đổi thứ tự, xoá
function duanRenderFormMedia() {
    const wrap = duanEl('duanMediaList');
    if (!wrap) return;
    if (!duanFormMedia.length) {
        wrap.innerHTML = '<p class="duan-empty-inline">Chưa có ảnh/video — hãy tải file lên hoặc dán link ở trên.</p>';
        return;
    }
    wrap.innerHTML = duanFormMedia.map((item, index) => {
        const media = duanDetectMedia(item.url) || { type: 'image', thumb: '' };
        const label = media.type === 'image' ? 'ẢNH' : (media.type === 'video' ? 'VIDEO' : String(media.provider || 'NHÚNG').toUpperCase());
        const icon = media.type === 'image' ? 'ph-image' : 'ph-video-camera';
        // Media dọc → ô xem trước cao hơn và hiện trọn ảnh; media ngang giữ khung ngang
        const portrait = duanMediaOrientation(item) === 'portrait';
        const probe = duanRatioProbeAttrs(item);
        return '<div class="duan-media-item' + (portrait ? ' is-portrait' : '') + '" data-duan-media="' + duanRatioKey(item.url) + '">' +
            '<div class="duan-media-preview">' +
                '<span class="duan-media-fallback"><i class="ph ' + icon + '" aria-hidden="true"></i></span>' +
                (media.thumb ? '<img src="' + duanEscape(media.thumb) + '" alt="" loading="lazy" decoding="async"' + probe + ' onerror="this.remove()">' : '') +
                '<span class="duan-chip duan-media-type">' + duanEscape(label) + (index === 0 ? ' · BÌA' : '') + '</span>' +
            '</div>' +
            '<div class="duan-media-actions">' +
                '<button type="button" class="duan-btn duan-btn--xs" data-duan-media-cover="' + index + '" title="Đặt làm ảnh bìa">Bìa</button>' +
                '<button type="button" class="duan-btn duan-btn--xs" data-duan-media-up="' + index + '" title="Đưa lên trước">▲</button>' +
                '<button type="button" class="duan-btn duan-btn--xs" data-duan-media-down="' + index + '" title="Đưa xuống sau">▼</button>' +
                '<button type="button" class="duan-btn duan-btn--xs duan-btn--danger" data-duan-media-del="' + index + '" title="Xoá khỏi dự án">Xoá</button>' +
            '</div>' +
        '</div>';
    }).join('');
}

// Thêm ảnh/video bằng LINK có sẵn trên web (ảnh, video, YouTube, Facebook, Vimeo, Google Drive).
// Nếu là link ảnh/video trực tiếp và ô "Tải link về kho Cloudinary" đang bật → upload qua web
// (Cloudinary tự tải file về kho), lỗi thì tự động lùi về cách dán link trực tiếp.
async function duanAddUrl() {
    if (!duanEnsureAdmin()) return;
    const input = duanEl('duanUrlInput');
    if (!input) return;
    const url = duanCleanLink(input.value);
    if (!url) { duanToast('⚠ Hãy dán link ảnh hoặc video', false); return; }
    if (duanFormMedia.some(m => m.url === url)) { duanToast('Link này đã có trong dự án', false); return; }

    const media = duanDetectMedia(url);
    const type = media ? media.type : 'image';
    const remoteBox = duanEl('duanRemoteFetch');
    const status = duanEl('duanMediaStatus');
    const canUploadRemote = (type === 'image' || type === 'video') &&
        !/^https:\/\/res\.cloudinary\.com\//i.test(url) &&
        !!(remoteBox && remoteBox.checked);
    input.value = '';

    if (canUploadRemote) {
        if (status) status.textContent = 'Đang tải link về kho Cloudinary...';
        try {
            // Media được xếp vào thư mục riêng của dự án đang thêm/sửa
            const hosted = await duanUploadRemote(url, type, duanFormTargetFolder());
            duanFormMedia.push({
                url: hosted.url,
                type: type,
                w: hosted.width || 0,
                h: hosted.height || 0
            });
            duanRenderFormMedia();
            if (status) status.textContent = '';
            duanToast('✓ Đã tải link về Cloudinary và thêm vào dự án', true);
            return;
        } catch (err) {
            console.warn('Không tải được link về Cloudinary:', err);
            if (status) status.textContent = '';
            duanToast('⚠ Không tải được link về Cloudinary — đã thêm bằng link trực tiếp', false);
        }
    }

    duanFormMedia.push({ url: url, type: type });
    duanRenderFormMedia();
    duanToast('✓ Đã thêm ' + duanMediaTypeLabel(type), true);
}

// Tải file từ máy lên Cloudinary (ảnh được nén trước; video gửi nguyên file)
async function duanHandleFiles(input) {
    if (!duanEnsureAdmin()) { if (input) input.value = ''; return; }
    const files = Array.from((input && input.files) || []);
    if (input) input.value = '';
    if (!files.length) return;

    const status = duanEl('duanMediaStatus');
    const folder = duanFormTargetFolder();   // thư mục riêng của dự án (theo tiêu đề đang gõ nếu là dự án mới)
    let done = 0;
    for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const isVideo = file.type.indexOf('video/') === 0 || /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(file.name);
        if (status) status.textContent = 'Đang tải ' + (i + 1) + '/' + files.length + ': ' + file.name;
        try {
            const uploaded = await duanUploadMediaFile(file, isVideo, folder);
            duanFormMedia.push({
                url: uploaded.url,
                type: isVideo ? 'video' : 'image',
                w: uploaded.width || 0,
                h: uploaded.height || 0
            });
            done += 1;
            duanRenderFormMedia();
        } catch (err) {
            console.error('Tải media lên thất bại:', err);
            duanToast('⚠ ' + file.name + ': ' + (err && err.message ? err.message : 'tải lên thất bại'), false);
        }
    }
    if (status) status.textContent = done ? '✓ Đã tải lên ' + done + ' file' : '';
    if (done) duanToast('✓ Đã thêm ' + done + ' file vào dự án', true);
}
// ==================== TẢI NHANH ẢNH/VIDEO TỪ WEB (giống "Tải ảnh lên" của album) ====================
// Ô chọn dự án nhận file, nằm trong thanh công cụ admin
function duanRenderQuickTarget() {
    const select = duanEl('duanQuickTarget');
    if (!select) return;
    const previous = select.value;
    const options = ['<option value="__new">＋ Dự án mới…</option>'].concat(
        duanProjects.map(p => '<option value="' + duanEscape(p.id) + '">' + duanEscape(p.title) + '</option>')
    );
    select.innerHTML = options.join('');
    if (previous && (previous === '__new' || duanProjectById(previous))) select.value = previous;
    else if (duanOpenProjectId && duanProjectById(duanOpenProjectId)) select.value = duanOpenProjectId;
    select.classList.toggle('hidden', !duanIsAdmin());
}

// Tải NHIỀU file vào 1 dự án — dùng chung cho nút ở thanh công cụ và nút trong khung xem dự án.
// Media được đưa vào THƯ MỤC RIÊNG của dự án trên Cloudinary: du-an/<ten-du-an>.
async function duanUploadFilesIntoProject(project, files, statusEl) {
    let done = 0;
    const folder = duanProjectFolder(project);
    for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const isVideo = file.type.indexOf('video/') === 0 || /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(file.name);
        if (statusEl) statusEl.textContent = 'Đang tải ' + (i + 1) + '/' + files.length + ': ' + file.name;
        try {
            const uploaded = await duanUploadMediaFile(file, isVideo, folder);
            project.media.push({
                url: uploaded.url,
                type: isVideo ? 'video' : 'image',
                w: uploaded.width || 0,
                h: uploaded.height || 0
            });
            done += 1;
        } catch (err) {
            console.error('Tải media lên thất bại:', err);
            duanToast('⚠ ' + file.name + ': ' + (err && err.message ? err.message : 'tải lên thất bại'), false);
        }
    }
    if (statusEl) statusEl.textContent = done ? '✓ Đã tải lên ' + done + ' file' : '';
    return done;
}
// Nút "Tải ảnh/video lên" ở thanh công cụ: tải file vào dự án đang chọn (hoặc tạo dự án mới ngay)
async function duanHandleQuickFiles(input) {
    if (!duanEnsureAdmin()) { if (input) input.value = ''; return; }
    const files = Array.from((input && input.files) || []);
    if (input) input.value = '';
    if (!files.length) return;

    const select = duanEl('duanQuickTarget');
    const targetId = select ? select.value : '__new';
    let project = targetId === '__new' ? null : duanProjectById(targetId);

    if (!project) {
        const suggested = 'Dự án ' + new Date().toLocaleDateString('vi-VN');
        const answer = window.prompt('Tiêu đề dự án mới cho ' + files.length + ' file vừa chọn:', suggested);
        const title = (answer || '').trim();
        if (!title) { duanToast('Đã huỷ tải lên', false); return; }
        duanMaterialize();
        project = duanNormalizeProject({
            id: duanNewId(),
            title: title.slice(0, 140),
            category: duanCategory === 'all' ? DUAN_CATEGORIES[0].key : duanCategory,
            description: '', link: '', linkLabel: '', media: [], createdAt: Date.now()
        });
        if (!project) { duanToast('⚠ Không tạo được dự án mới', false); return; }
        duanProjects.unshift(project);
        duanRenderAll();
    }

    const done = await duanUploadFilesIntoProject(project, files, duanEl('duanQuickStatus'));
    if (!done) { duanToast('⚠ Không tải được file nào', false); return; }
    duanRenderAll();
    duanPersist('✓ Đã thêm ' + done + ' file vào "' + project.title + '"');
}

// Nút "Tải lên" trong khung xem dự án: thêm trực tiếp vào dự án đang mở rồi lưu ngay
async function duanHandleProjectFiles(input) {
    if (!duanEnsureAdmin()) { if (input) input.value = ''; return; }
    const project = duanCurrentProject();
    if (!project) return;
    const files = Array.from((input && input.files) || []);
    if (input) input.value = '';
    if (!files.length) return;

    const done = await duanUploadFilesIntoProject(project, files, duanEl('duanProjectStatus'));
    if (!done) { duanToast('⚠ Không tải được file nào', false); return; }
    duanRenderAll();
    duanPersist('✓ Đã thêm ' + done + ' file vào dự án');
}

// Xoá 1 ảnh/video khỏi dự án đang mở (giống nút xoá trên từng ảnh trong album)
function duanDeleteProjectMedia(index) {
    if (!duanEnsureAdmin()) return;
    const project = duanCurrentProject();
    if (!project || index < 0 || index >= project.media.length) return;
    if (!window.confirm('Xoá ảnh/video này khỏi dự án?\n(File vẫn còn trên Cloudinary, chỉ gỡ khỏi danh sách hiển thị)')) return;
    project.media.splice(index, 1);
    if (duanViewIndex >= project.media.length) duanViewIndex = Math.max(0, project.media.length - 1);
    duanRenderAll();
    duanPersist('🗑 Đã xoá ảnh/video khỏi dự án');
}

// Đặt ảnh/video đang chọn làm bìa dự án
function duanSetProjectCover(index) {
    if (!duanEnsureAdmin()) return;
    const project = duanCurrentProject();
    if (!project || index <= 0 || index >= project.media.length) return;
    const picked = project.media.splice(index, 1)[0];
    project.media.unshift(picked);
    duanViewIndex = 0;
    duanRenderAll();
    duanPersist('✓ Đã đặt làm ảnh bìa dự án');
}

// Tải ảnh/video đang xem xuống máy (Cloudinary: thêm fl_attachment để chắc chắn tải được)
function duanDownloadCurrentMedia() {
    if (!duanEnsureAdmin()) return;
    const project = duanCurrentProject();
    if (!project || !project.media.length) { duanToast('Dự án chưa có ảnh/video để tải', false); return; }
    const media = duanDetectMedia(project.media[duanViewIndex].url);
    if (!media) return;
    let href = media.url;
    if (/^https:\/\/res\.cloudinary\.com\/.+\/video\/upload\//i.test(href)) {
        href = href.replace('/video/upload/', '/video/upload/fl_attachment/');
    } else if (/^https:\/\/res\.cloudinary\.com\/.+\/image\/upload\//i.test(href)) {
        href = href.replace('/image/upload/', '/image/upload/fl_attachment/');
    }
    const link = document.createElement('a');
    link.href = href;
    link.download = 'du-an-' + Date.now() + (media.type === 'video' ? '.mp4' : '.jpg');
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// ==================== UPLOAD QUA WEB: TẢI LINK CÓ SẴN VỀ KHO CLOUDINARY ====================
// Dán link ảnh/video từ trang khác → Cloudinary tự tải file về kho của mình (remote upload),
// nhờ vậy media không phụ thuộc vào việc trang gốc còn giữ file hay không.
async function duanUploadRemote(url, type, folder) {
    const resourceType = type === 'video' ? 'video' : 'image';
    const presets = [DUAN_CLOUDINARY_PRESET, DUAN_CLOUDINARY_FALLBACK_PRESET].filter(Boolean);
    let lastErr = null;
    for (let i = 0; i < presets.length; i += 1) {
        try {
            return await duanUploadRemoteWithPreset(url, resourceType, presets[i], folder);
        } catch (err) { lastErr = err; }
    }
    throw (lastErr || new Error('Không tải được link về Cloudinary'));
}

async function duanUploadRemoteWithPreset(remoteUrl, resourceType, preset, folder) {
    if (!DUAN_CLOUDINARY_CLOUD_NAME) throw new Error('Chưa cấu hình Cloudinary');
    const targetFolder = folder === undefined ? DUAN_CLOUDINARY_FOLDER : folder;
    const formData = new FormData();
    formData.append('file', remoteUrl);
    formData.append('upload_preset', preset);
    if (targetFolder) {
        formData.append('folder', targetFolder);
        formData.append('asset_folder', targetFolder);
    }
    const res = await fetch('https://api.cloudinary.com/v1_1/' + DUAN_CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload', {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        let detail = '';
        try {
            const data = await res.json();
            detail = data && data.error && data.error.message ? data.error.message : '';
        } catch (err) {}
        throw new Error('Cloudinary lỗi ' + res.status + (detail ? ': ' + detail : ''));
    }
    const data = await res.json();
    if (!data || !data.secure_url) throw new Error('Cloudinary không trả về URL');
    duanCheckUploadFolder(data, targetFolder);
    return { url: data.secure_url, width: Number(data.width) || 0, height: Number(data.height) || 0 };
}

// ==================== TẢI ẢNH / VIDEO LÊN CLOUDINARY ====================
// Ảnh: nén trong canvas rồi đưa lên dạng image. Video: gửi nguyên file dạng video
// (Cloudinary gói free cho tối đa 100MB mỗi file, nên giới hạn ở mức đó).
// Trả về { url, width, height } để biết ngay media là dọc hay ngang.
async function duanUploadMediaFile(file, isVideo, folder) {
    if (isVideo) {
        if (file.size > DUAN_VIDEO_MAX_BYTES) throw new Error('Video tối đa 100MB');
        const localSize = await duanReadVideoSize(file);
        const uploaded = await duanUploadWithFallback(file, 'du-an-video', 'video', folder);
        return {
            url: uploaded.url,
            width: uploaded.width || localSize.w,
            height: uploaded.height || localSize.h
        };
    }
    if (file.type.indexOf('image/') !== 0) throw new Error('Chỉ nhận file ảnh hoặc video');
    if (file.size > 20 * 1024 * 1024) throw new Error('Ảnh gốc tối đa 20MB');
    const compressed = await duanCompressImage(file, DUAN_IMAGE_MAX_DIMENSION, DUAN_IMAGE_MAX_BYTES);
    const uploaded = await duanUploadWithFallback(compressed.blob, 'du-an-anh', 'image', folder);
    return {
        url: uploaded.url,
        width: uploaded.width || compressed.width,
        height: uploaded.height || compressed.height
    };
}

// Đọc kích thước video ngay trong máy trước khi tải lên (video dọc/ngang)
function duanReadVideoSize(file) {
    return new Promise(resolve => {
        let objectUrl = '';
        let finished = false;
        const finish = size => {
            if (finished) return;
            finished = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
            resolve(size);
        };
        try { objectUrl = URL.createObjectURL(file); } catch (err) { resolve({ w: 0, h: 0 }); return; }
        const probe = document.createElement('video');
        probe.preload = 'metadata';
        probe.muted = true;
        probe.onloadedmetadata = () => finish({ w: probe.videoWidth || 0, h: probe.videoHeight || 0 });
        probe.onerror = () => finish({ w: 0, h: 0 });
        setTimeout(() => finish({ w: 0, h: 0 }), 8000);
        probe.src = objectUrl;
    });
}

// Thử preset riêng của Kho Dự án trước; nếu preset đó chưa được tạo thì dùng preset của trang chủ
async function duanUploadWithFallback(payload, namePrefix, resourceType, folder) {
    const presets = [DUAN_CLOUDINARY_PRESET, DUAN_CLOUDINARY_FALLBACK_PRESET].filter(Boolean);
    let lastErr = null;
    for (let i = 0; i < presets.length; i += 1) {
        try {
            return await duanUploadToCloudinary(payload, resourceType, namePrefix, presets[i], folder);
        } catch (err) { lastErr = err; }
    }
    throw (lastErr || new Error('Không tải được lên Cloudinary'));
}

async function duanUploadToCloudinary(payload, resourceType, namePrefix, preset, folder) {
    if (!DUAN_CLOUDINARY_CLOUD_NAME) throw new Error('Chưa cấu hình Cloudinary');
    const uniqueName = namePrefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) +
        (resourceType === 'video' ? '.mp4' : '.jpg');
    // folder = thư mục riêng của dự án (du-an/<ten-du-an>) → Media Library gọn gàng theo từng dự án
    const targetFolder = folder === undefined ? DUAN_CLOUDINARY_FOLDER : folder;
    const formData = new FormData();
    formData.append('file', payload, uniqueName);
    formData.append('upload_preset', preset);
    if (targetFolder) {
        formData.append('folder', targetFolder);
        formData.append('asset_folder', targetFolder);
    }
    const res = await fetch('https://api.cloudinary.com/v1_1/' + DUAN_CLOUDINARY_CLOUD_NAME + '/' + resourceType + '/upload', {
        method: 'POST',
        body: formData
    });
    if (!res.ok) {
        let detail = '';
        try {
            const data = await res.json();
            detail = data && data.error && data.error.message ? data.error.message : '';
        } catch (err) {}
        throw new Error('Cloudinary lỗi ' + res.status + (detail ? ': ' + detail : ''));
    }
    const data = await res.json();
    if (!data || !data.secure_url) throw new Error('Cloudinary không trả về URL');
    duanCheckUploadFolder(data, targetFolder);
    // Trả kèm kích thước thật để bìa/thumbnail chọn đúng khung dọc hay ngang ngay từ đầu
    return { url: data.secure_url, width: Number(data.width) || 0, height: Number(data.height) || 0 };
}

// Nén ảnh trong canvas: giảm cạnh dài rồi hạ dần chất lượng cho tới khi ≤ maxBytes.
// Trả về { blob, width, height } để biết ảnh dọc hay ngang.
function duanCompressImage(file, maxDimension, maxBytes) {
    const maxDim = maxDimension || DUAN_IMAGE_MAX_DIMENSION;
    const maxSize = maxBytes || DUAN_IMAGE_MAX_BYTES;
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

            const attempt = (quality, resizeAttempts) => {
                canvas.toBlob(blob => {
                    if (!blob) { reject(new Error('Không nén được ảnh')); return; }
                    if (blob.size > maxSize && quality > 0.35) { attempt(quality - 0.1, resizeAttempts); return; }
                    if (blob.size > maxSize && resizeAttempts < 3) {
                        canvas.width = Math.max(1, Math.round(canvas.width * 0.8));
                        canvas.height = Math.max(1, Math.round(canvas.height * 0.8));
                        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                        attempt(0.7, resizeAttempts + 1);
                        return;
                    }
                    // Trả kèm kích thước cuối cùng của ảnh đã nén (dọc/ngang) để chọn khung hiển thị
                    resolve({ blob: blob, width: canvas.width, height: canvas.height });
                }, 'image/jpeg', quality);
            };
            attempt(0.82, 0);
        };
        image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Không đọc được ảnh')); };
        image.src = objectUrl;
    });
}
// ==================== LƯU FORM / XOÁ DỰ ÁN / KHÔI PHỤC MẶC ĐỊNH ====================
function duanSubmitForm(event) {
    if (event) event.preventDefault();
    if (!duanEnsureAdmin()) return;

    const titleInput = duanEl('duanFormTitleInput');
    const title = titleInput ? titleInput.value.trim() : '';
    if (!title) { duanToast('⚠ Hãy nhập tiêu đề dự án', false); return; }

    const catSelect = duanEl('duanFormCategory');
    const descInput = duanEl('duanFormDesc');
    const linkInput = duanEl('duanFormLink');
    const linkLabelInput = duanEl('duanFormLinkLabel');
    const data = {
        title: title.slice(0, 140),
        category: catSelect ? catSelect.value : DUAN_CATEGORIES[0].key,
        description: descInput ? descInput.value.trim().slice(0, 600) : '',
        link: linkInput ? duanCleanLink(linkInput.value.trim()) : '',
        linkLabel: linkLabelInput ? linkLabelInput.value.trim().slice(0, 40) : '',
        media: duanFormMedia.map(m => ({ url: m.url, w: m.w || 0, h: m.h || 0 }))
    };

    let message = '✓ Đã thêm dự án mới';
    if (duanFormEditId) {
        const project = duanProjectById(duanFormEditId);
        if (project) { Object.assign(project, data); message = '✓ Đã cập nhật dự án'; }
    } else {
        duanMaterialize();
        // Dùng id đã chuẩn bị lúc mở form → khớp với tên thư mục Cloudinary đã dùng khi tải media lên
        duanProjects.unshift(Object.assign({ id: duanFormDraftId || duanNewId(), createdAt: Date.now() }, data));
    }
    // Nếu đang lọc theo danh mục khác thì chuyển sang danh mục vừa lưu để thấy ngay dự án
    if (duanCategory !== 'all' && duanCategory !== data.category) duanCategory = data.category;

    duanCloseForm();
    duanRenderAll();
    duanPersist(message);
}

function duanDeleteProject() {
    if (!duanEnsureAdmin()) return;
    const project = duanCurrentProject();
    if (!project) return;
    if (!window.confirm('Xoá dự án "' + project.title + '"?\n(Ảnh/video vẫn còn trên Cloudinary, chỉ gỡ khỏi danh sách hiển thị)')) return;
    duanMaterialize();
    duanProjects = duanProjects.filter(p => p.id !== project.id);
    duanCloseProject();
    duanRenderAll();
    duanPersist('🗑 Đã xoá dự án');
}

// Quay lại 5 danh mục mặc định: ghi `projects: null` vào store để lần sau vẫn hiện đúng như vậy
function duanResetDefaults() {
    if (!duanEnsureAdmin()) return;
    if (!window.confirm('Khôi phục 5 danh mục mặc định?\nDanh sách dự án hiện tại sẽ bị thay bằng các mục mặc định.')) return;
    duanProjects = duanDefaultProjects();
    duanProjectsSource = 'default';
    duanCategory = 'all';
    duanRenderAll();
    duanPersist('✓ Đã khôi phục danh mục mặc định');
}

// Đổi thứ tự / đặt bìa / xoá ảnh-video ngay trong form (chưa ghi vào store cho tới khi bấm Lưu)
function duanMoveFormMedia(index, delta) {
    const target = index + delta;
    if (index < 0 || index >= duanFormMedia.length) return;
    if (target < 0 || target >= duanFormMedia.length) return;
    const temp = duanFormMedia[index];
    duanFormMedia[index] = duanFormMedia[target];
    duanFormMedia[target] = temp;
    duanRenderFormMedia();
}

function duanSetFormCover(index) {
    if (index <= 0 || index >= duanFormMedia.length) return;
    const picked = duanFormMedia.splice(index, 1)[0];
    duanFormMedia.unshift(picked);
    duanRenderFormMedia();
    duanToast('✓ Đã đặt làm ảnh bìa', true);
}

function duanRemoveFormMedia(index) {
    if (index < 0 || index >= duanFormMedia.length) return;
    duanFormMedia.splice(index, 1);
    duanRenderFormMedia();
}
// ==================== SỰ KIỆN ====================
function duanBindEvents() {
    // Một listener duy nhất cho cả trang: mọi nút đều mang data-duan-* nên không phải gắn lại sau mỗi lần render
    document.addEventListener('click', duanOnClick);

    // Bấm ra vùng tối bên ngoài panel để đóng modal đang mở
    [['duanProjectModal', duanCloseProject], ['duanFormModal', duanCloseForm], ['duanLightbox', duanCloseLightbox]]
        .forEach(pair => {
            const modal = duanEl(pair[0]);
            if (!modal) return;
            modal.addEventListener('click', event => {
                if (event.target === modal) pair[1]();
            });
        });

    // Enter trong ô dán link = bấm "Thêm link" (không cho submit form sớm)
    const urlInput = duanEl('duanUrlInput');
    if (urlInput) {
        urlInput.addEventListener('keydown', event => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            duanAddUrl();
        });
    }

    // Đổi tiêu đề dự án → cập nhật gợi ý thư mục Cloudinary (dự án mới lấy tiêu đề làm tên thư mục)
    const formTitleInput = duanEl('duanFormTitleInput');
    if (formTitleInput) formTitleInput.addEventListener('input', duanRenderFormFolderHint);

    // Phím tắt: ESC đóng lớp trên cùng, ← → chuyển media/ảnh, Tab giữ trong modal
    document.addEventListener('keydown', event => {
        const lightboxOpen = duanIsLightboxOpen();
        const formOpen = duanIsFormOpen();
        const projectModal = duanEl('duanProjectModal');
        const projectOpen = !!(projectModal && !projectModal.classList.contains('hidden'));

        if (event.key === 'Escape') {
            if (lightboxOpen) { duanCloseLightbox(); return; }
            if (formOpen) { duanCloseForm(); return; }
            if (projectOpen) duanCloseProject();
            return;
        }
        if (lightboxOpen) {
            duanTrapFocus(event, duanEl('duanLightbox'));
            if (event.key === 'ArrowRight') duanLightboxStep(1);
            else if (event.key === 'ArrowLeft') duanLightboxStep(-1);
            return;
        }
        if (formOpen) { duanTrapFocus(event, duanEl('duanFormModal')); return; }
        if (projectOpen) {
            duanTrapFocus(event, projectModal);
            if (event.key === 'ArrowRight') duanViewStep(1);
            else if (event.key === 'ArrowLeft') duanViewStep(-1);
        }
    });
}

function duanOnClick(event) {
    const target = event.target;
    if (!target || !target.closest) return;

    const openBtn = target.closest('[data-duan-open]');
    if (openBtn) { duanOpenProject(openBtn.dataset.duanOpen); return; }

    const tab = target.closest('[data-duan-cat]');
    if (tab) { duanCategory = tab.dataset.duanCat; duanRenderTabs(); duanRenderGrid(); return; }

    // Công cụ admin trên từng thumbnail (đặt bìa / xoá) — kiểm tra TRƯỚC [data-duan-thumb]
    const thumbCover = target.closest('[data-duan-thumb-cover]');
    if (thumbCover) { duanSetProjectCover(Number(thumbCover.dataset.duanThumbCover)); return; }
    const thumbDel = target.closest('[data-duan-thumb-del]');
    if (thumbDel) { duanDeleteProjectMedia(Number(thumbDel.dataset.duanThumbDel)); return; }

    const thumb = target.closest('[data-duan-thumb]');
    if (thumb) {
        duanViewIndex = Number(thumb.dataset.duanThumb) || 0;
        duanRenderViewer(duanCurrentProject());
        return;
    }

    const nav = target.closest('[data-duan-nav]');
    if (nav) { duanViewStep(nav.dataset.duanNav === 'prev' ? -1 : 1); return; }

    const lbNav = target.closest('[data-duan-lb-nav]');
    if (lbNav) { duanLightboxStep(lbNav.dataset.duanLbNav === 'prev' ? -1 : 1); return; }

    if (target.closest('[data-duan-zoom]')) { duanOpenLightbox(); return; }

    const close = target.closest('[data-duan-close]');
    if (close) {
        const which = close.dataset.duanClose;
        if (which === 'form') duanCloseForm();
        else if (which === 'lightbox') duanCloseLightbox();
        else duanCloseProject();
        return;
    }

    if (target.closest('[data-duan-new]')) { duanOpenForm(null, false); return; }
    if (target.closest('[data-duan-add-media]')) { duanOpenForm(duanOpenProjectId, true); return; }
    if (target.closest('[data-duan-edit]')) { duanOpenForm(duanOpenProjectId, false); return; }
    if (target.closest('[data-duan-delete]')) { duanDeleteProject(); return; }
    if (target.closest('[data-duan-download]')) { duanDownloadCurrentMedia(); return; }
    if (target.closest('[data-duan-reset]')) { duanResetDefaults(); return; }
    if (target.closest('[data-duan-logout]')) { duanSignOut(); return; }
    if (target.closest('[data-duan-add-url]')) { duanAddUrl(); return; }
    if (target.closest('[data-duan-upload]')) {
        if (duanEnsureAdmin()) {
            const input = duanEl('duanFileInput');
            if (input) input.click();
        }
        return;
    }
    // Tải ảnh/video lên thẳng 1 dự án (thanh công cụ) hoặc vào dự án đang mở
    if (target.closest('[data-duan-quick-upload]')) {
        if (duanEnsureAdmin()) {
            const input = duanEl('duanQuickInput');
            if (input) input.click();
        }
        return;
    }
    if (target.closest('[data-duan-project-upload]')) {
        if (duanEnsureAdmin()) {
            const input = duanEl('duanProjectFileInput');
            if (input) input.click();
        }
        return;
    }

    const mediaCover = target.closest('[data-duan-media-cover]');
    if (mediaCover) { duanSetFormCover(Number(mediaCover.dataset.duanMediaCover)); return; }
    const mediaUp = target.closest('[data-duan-media-up]');
    if (mediaUp) { duanMoveFormMedia(Number(mediaUp.dataset.duanMediaUp), -1); return; }
    const mediaDown = target.closest('[data-duan-media-down]');
    if (mediaDown) { duanMoveFormMedia(Number(mediaDown.dataset.duanMediaDown), 1); return; }
    const mediaDel = target.closest('[data-duan-media-del]');
    if (mediaDel) { duanRemoveFormMedia(Number(mediaDel.dataset.duanMediaDel)); return; }
}

// ==================== KHỞI ĐỘNG ====================
function duanInit() {
    duanSetupCategoryOptions();
    duanBindEvents();
    duanSetupGoogleAuth();   // đọc phiên đăng nhập sẵn có + vẽ nút Google
    duanLoadStore();         // server → cloud → data.js (offline)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', duanInit);
else duanInit();