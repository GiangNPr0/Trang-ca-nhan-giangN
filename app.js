  let totalMemeImages = 0;
  let totalBtsImages = 0;

  // Dữ liệu khởi tạo lấy từ data.js (window.SITE_DATA) và dùng làm bản dự phòng khi offline.
  // Khi chạy online: lời nhắn & lượt yêu thích đồng bộ qua jsonbin.io, ảnh lưu trên Cloudinary, đăng nhập bằng Google.
  let galleryStore = normalizeGalleryStore(window.SITE_DATA || { messages: [], ratings: {} });
  let galleryDataDirty = false;

  let allGalleryImages = [];
  let albumImages = { bts: [], albummeme: [] };
let currentIndex = 0;
let lightboxList = [];
let activeAlbumImages = [];
let activeAlbumLabel = 'Ảnh meme';
const fallbackAlbumImages = {
    bts: Array.from({ length: 4 }, (_, index) => `image/bts/1 (${index + 1}).jpg`),
    albummeme: Array.from({ length: 4 }, (_, index) => `image/albummeme/1 (${index + 1}).jpg`)
};

let selectedImageSource = null;

// ==================== LƯU ẢNH LỜI NHẮN QUA CLOUDINARY ====================
// Ảnh được nén nhẹ rồi tải trực tiếp từ trình duyệt lên Cloudinary (unsigned upload).
// Chỉ URL ngắn của ảnh được lưu trong jsonbin.io → bin không còn bị giới hạn 100KB vì ảnh.
// >>> ĐIỀN 2 GIÁ TRỊ DƯỚI ĐÂY bằng thông tin trong dashboard Cloudinary của bạn <<<
const CLOUDINARY_CLOUD_NAME = 'g9uxwrbl';
const CLOUDINARY_UPLOAD_PRESET = 'GiangNweb';
const CLOUDINARY_FOLDER = 'Loi-nhan';
const IMAGE_MAX_DIMENSION = 1280;
const IMAGE_MAX_BYTES = 400 * 1024;
// Folder Cloudinary cho từng album — ghi ĐÚNG chữ thường như Folder trong preset ("bts" / "albummeme").
// Ghi chú: 2 preset album đã cố định Folder nên Cloudinary BỎ QUA tham số folder/asset_folder gửi kèm;
// giữ đúng tên ở đây để nếu preset chuyển sang chế độ dynamic thì ảnh vẫn vào đúng folder.
const CLOUDINARY_ALBUM_FOLDERS = { bts: 'bts', albummeme: 'albummeme' };
// Preset riêng cho từng album (mỗi preset cố định Folder trong dashboard Cloudinary).
// Tạo preset: Settings → Upload → Add upload preset, Signing Mode = Unsigned, Folder = bts / albummeme.
// Để trống '' = dùng chung CLOUDINARY_UPLOAD_PRESET.
const CLOUDINARY_ALBUM_PRESETS = { bts: 'GiangNweb_bts', albummeme: 'GiangNweb_album' };
// Ảnh album: giữ chất lượng cao hơn ảnh lời nhắn
const ALBUM_IMAGE_MAX_DIMENSION = 1600;
const ALBUM_IMAGE_MAX_BYTES = 1024 * 1024;

// ==================== ẢNH THU NHỎ CHO BÌA/LƯỚI (TIẾT KIỆM BĂNG THÔNG) ====================
// Ảnh trên Cloudinary là bản 1600px (~350KB). Khi chỉ hiển thị ở ô nhỏ (bìa album, lưới album,
// bảng xếp hạng, ảnh lời nhắn) ta thêm transformation f_auto,q_auto,w_<bề rộng> để Cloudinary
// trả về bản nhẹ (WebP/AVIF, ~16KB) → tải nhanh hơn nhiều lần.
// Lightbox và nút "Tải xuống" vẫn dùng URL GỐC nên chất lượng xem/tải không thay đổi,
// và URL lưu trong jsonbin cũng không bị sửa (chỉ đổi lúc hiển thị).
const THUMB_WIDTH = { cover: 400, grid: 500, topRated: 240, message: 600 };

function cloudThumbUrl(url, width) {
    if (typeof url !== 'string' || !width) return url;
    const match = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/i);
    if (!match) return url; // ảnh cục bộ hoặc nguồn khác: giữ nguyên
    // Đã có transformation sẵn (vd: fl_attachment, f_auto,w_400) thì không thêm nữa
    if (/^[a-z]{1,3}_[^/]*\//i.test(match[2])) return url;
    return match[1] + 'f_auto,q_auto,w_' + width + '/' + match[2];
}

function setAlbumImages(albums) {
    const source = albums || {};
    // Nếu album trên cloud còn rỗng thì dùng ảnh cục bộ làm mặc định
    const btsList = Array.isArray(source.bts) && source.bts.length ? source.bts : fallbackAlbumImages.bts;
    const memeList = Array.isArray(source.albummeme) && source.albummeme.length ? source.albummeme : fallbackAlbumImages.albummeme;
    albumImages = { bts: btsList, albummeme: memeList };
    totalBtsImages = albumImages.bts.length;
    totalMemeImages = albumImages.albummeme.length;
    allGalleryImages = [...albumImages.bts, ...albumImages.albummeme];

    document.querySelectorAll('[data-album-cover]').forEach(image => {
        const images = albumImages[image.dataset.albumCover];
        const src = images?.[Number.parseInt(image.dataset.coverIndex, 10)];
        const thumbSrc = src ? cloudThumbUrl(src, THUMB_WIDTH.cover) : null;
        if (thumbSrc) { image.style.visibility = ''; image.src = thumbSrc; }
        // Chỉ ẩn ảnh bìa khi CHÍNH ảnh đang hiển thị bị lỗi. Nếu ảnh đặt sẵn trong HTML (ảnh cục bộ)
        // báo lỗi sau khi đã đổi sang ảnh Cloudinary, sự kiện error của ảnh cũ sẽ bị bỏ qua.
        image.onerror = () => {
            const shown = thumbSrc || image.getAttribute('src');
            if (image.getAttribute('src') === shown) image.style.visibility = 'hidden';
        };
    });
    updateAlbumCountBadges();
}

// Cập nhật lại lưới ảnh nếu modal album đang mở (sau khi đồng bộ cloud hoặc tải/xoá ảnh)
function refreshOpenAlbumModal() {
    const albumModal = document.getElementById('albumModal');
    if (albumModal && !albumModal.classList.contains('hidden')) {
        activeAlbumImages = activeAlbumLabel === 'Ảnh hậu trường' ? albumImages.bts : albumImages.albummeme;
        renderAlbumItems(activeAlbumImages, activeAlbumLabel);
    }
}

function updateAlbumCountBadges() {
    const badges = [
        ['btsCountBadge', totalBtsImages],
        ['photoCountBadge', totalMemeImages]
    ];
    badges.forEach(([id, count]) => {
        const badge = document.getElementById(id);
        if (!badge) return;
        const label = `${count} ảnh`;
        badge.innerText = label;
        badge.setAttribute('aria-label', `Số lượng: ${label}`);
    });
}

async function loadAlbumImages() {
    // Chế độ server (mini PC): lấy danh sách ảnh album từ API
    if (isServerMode) {
        if (loadAlbumImages.inFlight) return loadAlbumImages.inFlight;
        loadAlbumImages.inFlight = (async () => {
            const response = await fetch('/api/albums', { cache: 'no-store' });
            if (!response.ok) throw new Error(`Album API failed: ${response.status}`);
            setAlbumImages(await response.json());
            refreshOpenAlbumModal();
        })().finally(() => {
            loadAlbumImages.inFlight = null;
        });
        return loadAlbumImages.inFlight;
    }
    // Chế độ cloud (jsonbin) / offline: danh sách ảnh nằm trong galleryStore.albums (có fallback cục bộ)
    setAlbumImages(galleryStore.albums);
    refreshOpenAlbumModal();
}
loadAlbumImages.inFlight = null;

function previewSelectedImage(input) {
    if (input.files && input.files[0]) {
      previewImageFile(input.files[0]);
  }
}

// Nén ảnh trong canvas trước khi tải lên để tiết kiệm băng thông Cloudinary
function compressImage(file, maxDimension, maxBytes) {
  const maxDim = maxDimension || IMAGE_MAX_DIMENSION;
  const maxSize = maxBytes || IMAGE_MAX_BYTES;
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

          const attempt = (quality, resizeAttempts = 0) => {
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
                  resolve(blob);
              }, 'image/jpeg', quality);
          };
          attempt(0.8);
      };
      image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Không đọc được ảnh')); };
      image.src = objectUrl;
  });
}

// Tải ảnh lên Cloudinary bằng unsigned upload preset, trả về URL ảnh
async function uploadToCloudinary(blob, folder, namePrefix, presetName) {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME.indexOf('thay-bang') === 0 ||
      !CLOUDINARY_UPLOAD_PRESET || CLOUDINARY_UPLOAD_PRESET.indexOf('thay-bang') === 0) {
      throw new Error('Chưa cấu hình Cloudinary (cloud name / upload preset)');
  }
  const formData = new FormData();
  // Tên file DUY NHẤT cho mỗi ảnh. Nếu dùng cùng tên, Cloudinary sẽ dùng cùng public_id
  // và GHI ĐÈ ảnh cũ → mọi lời nhắn sẽ trỏ về cùng một ảnh.
  const prefix = namePrefix || 'loi-nhan';
  const uniqueName = prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg';
  formData.append('file', blob, uniqueName);
  formData.append('upload_preset', presetName || CLOUDINARY_UPLOAD_PRESET);
  const targetFolder = folder === undefined ? CLOUDINARY_FOLDER : folder;
  // Gửi cả 'folder' và 'asset_folder' (Cloudinary có 2 chế độ folder: dynamic/fixed).
  // LƯU Ý: nếu preset đã cố định Folder thì các tham số này bị BỎ QUA — khi đó cần preset riêng cho mỗi folder.
  if (targetFolder) { formData.append('folder', targetFolder); formData.append('asset_folder', targetFolder); }
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData
  });
  if (!res.ok) throw new Error('Cloudinary tải ảnh thất bại: ' + res.status);
  const data = await res.json();
  if (!data || !data.secure_url) throw new Error('Cloudinary không trả về URL ảnh');
  return data.secure_url;
}

async function previewImageFile(file) {
  const label = document.getElementById('imageLabelText');
  if (!file.type.startsWith('image/')) {
      if (label) label.innerText = 'Vui lòng chọn file ảnh';
      return;
  }
  if (file.size > 10 * 1024 * 1024) {
      if (label) label.innerText = 'Ảnh tối đa 10MB';
      return;
  }

  selectedImageSource = null;
  if (label) label.innerText = 'Đang xử lý ảnh...';
  try {
      const blob = await compressImage(file);
      const previewImg = document.getElementById('imagePreview');
      if (previewImg) {
          if (previewImg.dataset.objectUrl) URL.revokeObjectURL(previewImg.dataset.objectUrl);
          const objectUrl = URL.createObjectURL(blob);
          previewImg.dataset.objectUrl = objectUrl;
          previewImg.src = objectUrl;
      }
      document.getElementById('imagePreviewContainer')?.classList.remove('hidden');

      if (label) label.innerText = 'Đang tải ảnh lên...';
      selectedImageSource = await uploadToCloudinary(blob);
      if (label) label.innerText = '✓ Ảnh đã sẵn sàng';
  } catch (err) {
      console.error('Tải ảnh lên Cloudinary thất bại:', err);
      selectedImageSource = null;
      if (label) label.innerText = 'Không tải được ảnh, thử lại';
  }
}

function handleImageDrop(event) {
  event.preventDefault();
  const dropZone = document.getElementById('imageDropZone');
  if (dropZone) dropZone.classList.remove('border-blue-400', 'bg-blue-50');
  const file = event.dataTransfer && event.dataTransfer.files[0];
  if (!file) return;

  const input = document.getElementById('imageInput');
  if (input && typeof DataTransfer !== 'undefined') {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
  }
  previewImageFile(file);
}

function removeSelectedImage() {
  selectedImageSource = null;
  const input = document.getElementById('imageInput');
  if (input) input.value = '';
  document.getElementById('imagePreviewContainer')?.classList.add('hidden');
  const previewImg = document.getElementById('imagePreview');
  if (previewImg) {
      if (previewImg.dataset.objectUrl) {
          URL.revokeObjectURL(previewImg.dataset.objectUrl);
          delete previewImg.dataset.objectUrl;
      }
      previewImg.removeAttribute('src');
  }
  const label = document.getElementById('imageLabelText');
  if (label) label.innerText = 'Thêm ảnh hoặc kéo thả';
}

function setupImageDropZone() {
  const dropZone = document.getElementById('imageDropZone');
  if (!dropZone) return;
  dropZone.addEventListener('dragover', event => {
      event.preventDefault();
      dropZone.classList.add('border-blue-400', 'bg-blue-50');
  });
  dropZone.addEventListener('dragleave', event => {
      if (!dropZone.contains(event.relatedTarget)) {
          dropZone.classList.remove('border-blue-400', 'bg-blue-50');
      }

  });
  dropZone.addEventListener('drop', handleImageDrop);
  dropZone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          document.getElementById('imageInput').click();
      }
  });
}

function setupDonateQrEffect() {
 const group = document.getElementById('qrHoverGroup');
 const overlay = document.getElementById('qrPageOverlay');
 const qrImage = document.getElementById('qrHoverImage');
 if (!group || !overlay || !qrImage) return;

 const showQr = () => {
     group.classList.add('is-active');
     const groupRect = group.getBoundingClientRect();
     qrImage.style.left = `${groupRect.left + groupRect.width / 2}px`;
     qrImage.style.top = `${groupRect.top + groupRect.height / 2}px`;
     overlay.classList.add('is-visible');
     qrImage.classList.add('is-visible');
 };
 const hideQr = () => {
     group.classList.remove('is-active');
     overlay.classList.remove('is-visible');
     qrImage.classList.remove('is-visible');
 };

 group.addEventListener('mouseenter', showQr);
 group.addEventListener('mouseleave', hideQr);
 group.addEventListener('focusin', showQr);
 group.addEventListener('focusout', hideQr);
 window.addEventListener('scroll', () => {
     if (group.classList.contains('is-active')) showQr();
 }, { passive: true });
}

 // ==================== XỬ LÝ DỮ LIỆU DỰ PHÒNG (data.js) & LỜI NHẮN ====================

  // 1. Nạp danh sách lời nhắn & lượt yêu thích từ data.js (chỉ dùng khi offline: không có server/jsonbin)
  function fetchMessagesFromLocalData() {
      const data = window.SITE_DATA || { messages: [], ratings: {}, albums: { bts: [], albummeme: [] } };
      galleryStore = normalizeGalleryStore(data);
      renderAll();
  }

  // Gom các bước render lặp lại ở nhiều nơi (đọc server/cloud/offline) vào một chỗ.
  // (Bản trước gọi chính nó → đệ quy vô hạn, khiến mọi lần tải trang đều lỗi âm thầm.)
  function renderAll() {
      renderMessages(galleryStore.messages);
      setAlbumImages(galleryStore.albums);
      renderTopRated();
      renderMessageTopRated(galleryStore.messages);
  }

  function normalizeGalleryStore(record) {
      if (Array.isArray(record)) return { messages: record, ratings: {}, albums: { bts: [], albummeme: [] } };
      const albums = record && record.albums && typeof record.albums === 'object' ? record.albums : {};
      return {
          messages: Array.isArray(record?.messages) ? record.messages : [],
          ratings: record?.ratings && typeof record.ratings === 'object' ? record.ratings : {},
          albums: {
              bts: Array.isArray(albums.bts) ? albums.bts : [],
              albummeme: Array.isArray(albums.albummeme) ? albums.albummeme : []
          }
      };
  }

  // ==================== LƯU DỮ LIỆU: SERVER / JSONBIN.IO / FILE OFFLINE ====================
  // Thứ tự ưu tiên khi lưu lời nhắn & lượt yêu thích:
  //   1) server.js (mini PC trong nhà)  → ghi vào data.js trên máy chủ.
  //   2) jsonbin.io (đã cấu hình)        → đồng bộ trực tuyến.
  //   3) file:// không có server/cloud  → File System Access API lưu data.js, hoặc tải thủ công.
  const AUTO_FILE_NAME = 'data.js';
  let autoSaveQueue = Promise.resolve();
  let isServerMode = false;
  let pendingSaves = 0;

  // Lưu toàn bộ dữ liệu lên server rồi đồng bộ về (chỉ chạy khi do server phục vụ)
  async function syncToServer() {
      const res = await fetch('/api/data', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(galleryStore)
      });
      if (!res.ok) throw new Error('Server /api/data thất bại: ' + res.status);
      galleryStore = normalizeGalleryStore(await res.json());
      renderAll();
      showAutoSaveToast('✓ Đã lưu lên server', true);
  }

  // Thử kết nối server; nếu có thì chuyển sang chế độ tự động hoàn toàn
  async function detectServerMode() {
      // Chỉ thử khi trang được phục vụ qua http(s). Mở bằng file:// (hoặc host tĩnh không có
      // backend) thì chắc chắn không có /api/data → bỏ luôn để tránh 1 request 404 mỗi lần tải trang.
      if (!/^https?:$/i.test(window.location.protocol)) return false;
      try {
          const res = await fetch('/api/data', { cache: 'no-store' });
          if (!res.ok) return false;
          const data = await res.json();
          galleryStore = normalizeGalleryStore(data);
          isServerMode = true;
          return true;
      } catch (err) {
          return false;
      }
  }

  // ==================== ĐỒNG BỘ TRỰC TUYẾN QUA JSONBIN.IO ====================
  // Lời nhắn (kèm ảnh base64) và lượt yêu thích được lưu trên jsonbin.io để mọi
  // thiết bị dùng chung một nguồn dữ liệu trực tuyến.
  // Lưu ý: bin bản Free của jsonbin.io chỉ chứa tối đa khoảng 100KB (Pro: 10MB).
  const JSONBIN_BIN_ID = '6a9fd4f2ac6210605ab2e044';
  // ĐÃ XOÁ khoá khỏi web (mục #9): mọi đọc/ghi đều đi qua Worker proxy ở trên,
  // khoá master chỉ nằm trong Cloudflare Secret của Worker → người mở web không thể lấy được.
  const JSONBIN_MASTER_KEY = '';
  const JSONBIN_BASE_URL = 'https://api.jsonbin.io/v3/b';
  let isCloudMode = false;

  // ==================== PROXY BẢO MẬT (CHE KHOÁ JSONBIN) ====================
  // Vấn đề: code chạy trong trình duyệt nên ai mở web cũng đọc được JSONBIN_MASTER_KEY ở trên
  // → có thể ghi đè/xoá sạch bin (mất hết lời nhắn + lượt yêu thích).
  // Cách khắc phục: dựng một proxy nhỏ (Cloudflare Worker — xem thư mục cloudflare-worker
  // trong Documents\_giangN-backup\) giữ khoá ở phía server, rồi dán URL vào JSONBIN_PROXY_URL.
  // Khi đã điền URL proxy:
  //   • Đọc dữ liệu   : GET  <proxy>/data      (công khai, không cần khoá)
  //   • Gửi lời nhắn  : POST <proxy>/post      (kèm ID token Google để server xác thực người gửi)
  //   • Thả tim       : POST <proxy>/favorite  (kèm ID token, server chỉ cộng/trừ ±1)
  //   • Admin sửa/xoá : POST <proxy>/admin     (kèm ID token, server kiểm tra đúng email admin)
  // Sau khi proxy chạy ổn, có thể đặt JSONBIN_MASTER_KEY = '' để khoá biến mất hoàn toàn khỏi web.
  // Để trống '' = chưa deploy → trang chạy y như cũ (dùng khoá trực tiếp).
  const JSONBIN_PROXY_URL = 'https://giangn.n-giang06022000.workers.dev';
  function useProxy() { return !!JSONBIN_PROXY_URL; }
  let googleIdToken = null;   // ID token Google (JWT ~1 giờ) để proxy xác thực người gửi

  function proxyEndpoint(path) {
      return JSONBIN_PROXY_URL.replace(/\/+$/, '') + path;
  }

  function proxyHeaders(withJson) {
      const headers = {};
      if (withJson) headers['Content-Type'] = 'application/json';
      if (googleIdToken) headers['X-Google-Token'] = googleIdToken;
      return headers;
  }

  async function proxyRequest(path, options) {
      const res = await fetch(proxyEndpoint(path), options);
      let payload = null;
      try { payload = await res.json(); } catch (err) {}
      if (!res.ok) {
          const err = new Error((payload && payload.error) || ('Proxy thất bại: ' + res.status));
          err.status = res.status;
          throw err;
      }
      return payload;
  }

  // Đọc dữ liệu mới nhất (qua proxy nếu đã cấu hình, ngược lại gọi jsonbin trực tiếp)
  async function fetchFromJsonBin() {
      if (useProxy()) {
          const payload = await proxyRequest('/data', { cache: 'no-store' });
          return normalizeGalleryStore(payload && payload.record ? payload.record : payload);
      }
      const res = await fetch(`${JSONBIN_BASE_URL}/${JSONBIN_BIN_ID}/latest`, {
          headers: { 'X-Master-Key': JSONBIN_MASTER_KEY },
          cache: 'no-store'
      });
      if (!res.ok) throw new Error('JSONBin đọc thất bại: ' + res.status);
      const payload = await res.json();
      return normalizeGalleryStore(payload && payload.record ? payload.record : payload);
  }

  // Ghi toàn bộ galleryStore lên jsonbin.io
  async function syncToJsonBin() {
      const body = JSON.stringify(galleryStore);
      const sizeKB = Math.round(body.length / 1024);
      const res = await fetch(`${JSONBIN_BASE_URL}/${JSONBIN_BIN_ID}`, {
          method: 'PUT',
          headers: {
              'Content-Type': 'application/json',
              'X-Master-Key': JSONBIN_MASTER_KEY
          },
          body
      });
      if (!res.ok) {
          // Bin free của jsonbin chỉ chứa ~100KB → lỗi 400/413 thường là do dữ liệu quá lớn
          const err = new Error('JSONBin ghi thất bại: ' + res.status);
          err.status = res.status;
          err.sizeKB = sizeKB;
          throw err;
      }
      const payload = await res.json();
      galleryStore = normalizeGalleryStore(payload && payload.record ? payload.record : galleryStore);
      renderAll();
      // Cảnh báo sớm khi dữ liệu tiến gần giới hạn 100KB của bin free
      if (sizeKB >= 85) {
          showAutoSaveToast(`⚠ Dữ liệu gần đầy bin jsonbin (${sizeKB}KB/100KB) — nên xoá bớt lời nhắn cũ`, false);
      } else if (sizeKB >= 60) {
          showAutoSaveToast(`✓ Đã được tải lên (dữ liệu ${sizeKB}KB/100KB)`, true);
      } else {
          showAutoSaveToast('✓ Đã được tải lên', true);
      }
  }

  // ==================== GHI QUA PROXY (chỉ dùng khi đã cấu hình JSONBIN_PROXY_URL) ====================

  // Ghi toàn bộ dữ liệu (dùng cho thao tác admin: sửa/xoá lời nhắn, thêm/xoá ảnh album)
  async function syncToProxyAdmin() {
      const body = JSON.stringify({ store: galleryStore });
      const sizeKB = Math.round(body.length / 1024);
      const payload = await proxyRequest('/admin', { method: 'POST', headers: proxyHeaders(true), body });
      galleryStore = normalizeGalleryStore(payload && payload.record ? payload.record : galleryStore);
      renderAll();
      if (sizeKB >= 85) {
          showAutoSaveToast(`⚠ Dữ liệu gần đầy bin jsonbin (${sizeKB}KB/100KB) — nên xoá bớt lời nhắn cũ`, false);
      } else {
          showAutoSaveToast('✓ Đã được tải lên', true);
      }
  }

  // Gửi 1 lời nhắn mới: server tự xác thực Google rồi chèn vào bin (không ghi đè toàn bộ dữ liệu)
  async function postMessageViaProxy(item) {
      const payload = await proxyRequest('/post', {
          method: 'POST',
          headers: proxyHeaders(true),
          body: JSON.stringify({ message: item })
      });
      if (payload && payload.record) {
          galleryStore = normalizeGalleryStore(payload.record);
          renderAll();
      }
  }

  // Đồng bộ chênh lệch lượt yêu thích: [{ image, delta }]
  async function syncFavoritesViaProxy(deltas) {
      const payload = await proxyRequest('/favorite', {
          method: 'POST',
          headers: proxyHeaders(true),
          body: JSON.stringify({ deltas })
      });
      if (payload && payload.record) {
          galleryStore = normalizeGalleryStore(payload.record);
          renderAll();
      }
  }

  // Đọc từ jsonbin.io kèm thử lại vài lần để chịu được lỗi mạng tạm thời
  async function fetchFromJsonBinWithRetry(attempts) {
      let lastErr;
      for (let i = 0; i < attempts; i += 1) {
          try {
              return await fetchFromJsonBin();
          } catch (err) {
              lastErr = err;
              await new Promise(resolve => setTimeout(resolve, 700 * (i + 1)));
          }
      }
      throw lastErr;
  }

  // Thử đọc từ jsonbin.io lúc tải trang; thành công thì bật chế độ cloud
  async function detectCloudMode() {
      if (!JSONBIN_BIN_ID) return false;
      galleryStore = await fetchFromJsonBinWithRetry(3);
      isCloudMode = true;
      renderAll();
      return true;
  }

  // Làm mới dữ liệu từ cloud (gọi khi quay lại tab) nếu có thay đổi từ thiết bị khác
  async function refreshFromCloud() {
      if (isServerMode || !isCloudMode || pendingSaves > 0) return;
      try {
          const remote = await fetchFromJsonBin();
          if (JSON.stringify(remote.messages) !== JSON.stringify(galleryStore.messages)
              || JSON.stringify(remote.ratings) !== JSON.stringify(galleryStore.ratings)) {
              galleryStore = remote;
              isCloudMode = true;
              renderAll();
          }
      } catch (err) {
          console.warn('Không làm mới được dữ liệu từ jsonbin.io:', err);
      }
  }

  function openHandleStore() {
      return new Promise((resolve, reject) => {
          let req;
          try { req = indexedDB.open('giang_file_handle', 1); }
          catch (err) { reject(err); return; }
          req.onupgradeneeded = () => {
              const db = req.result;
              if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
      });
  }

  async function keepFileHandle(fileHandle) {
      const db = await openHandleStore();
      return new Promise((resolve, reject) => {
          const tx = db.transaction('handles', 'readwrite');
          tx.objectStore('handles').put(fileHandle, AUTO_FILE_NAME);
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); reject(tx.error); };
      });
  }

  async function readStoredFileHandle() {
      const db = await openHandleStore();
      return new Promise(resolve => {
          const tx = db.transaction('handles', 'readonly');
          const get = tx.objectStore('handles').get(AUTO_FILE_NAME);
          get.onsuccess = () => { db.close(); resolve(get.result || null); };
          get.onerror = () => { db.close(); resolve(null); };
      });
  }

  function showAutoSaveToast(message, ok, extraHtml) {
      const toast = document.getElementById('autoSaveToast');
      if (!toast) return;
      toast.className = 'fixed bottom-4 right-4 z-[110] max-w-xs rounded-xl border px-3 py-2 text-xs font-medium shadow-lg ' +
          (ok ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-red-500 text-white border-red-700');
      toast.innerHTML = extraHtml || message;
      clearTimeout(window.__autoSaveToastTimer);
      window.__autoSaveToastTimer = setTimeout(() => {
          toast.classList.add('hidden');
      }, 4200);
  }

  function buildDataPayload() {
      return 'window.SITE_DATA = ' + JSON.stringify(galleryStore, null, 2) + ';';
  }

  // Ghi đè file data.js. Kết quả: 'saved' | 'cancelled' | 'unsupported' | 'error'
  async function writeToDataFile() {
      const payload = buildDataPayload();
      let fileHandle = null;
      try { fileHandle = await readStoredFileHandle(); } catch (err) { fileHandle = null; }
      if (!fileHandle) {
          if (!window.showSaveFilePicker) return 'unsupported';
          try {
              fileHandle = await window.showSaveFilePicker({
                  suggestedName: AUTO_FILE_NAME,
                  types: [{ description: 'JavaScript', accept: { 'text/javascript': ['.js'] } }]
              });
          } catch (err) { return 'cancelled'; }
      }
      try {
          const writable = await fileHandle.createWritable();
          await writable.write(payload);
          await writable.close();
          if (window.showSaveFilePicker) keepFileHandle(fileHandle).catch(() => {});
          return 'saved';
      } catch (err) { return 'error'; }
  }

  // Tự động lưu khi có dữ liệu mới (chạy tuần tự, không ghi chồng lên nhau)
  function syncDataToFile() {
      const task = autoSaveQueue.then(() => writeToDataFile()).then(result => {
          if (result === 'saved') {
              try { sessionStorage.removeItem('giang_session_dirty'); } catch (err) {}
              showAutoSaveToast('✓ Đã tự động lưu vào data.js', true);
          } else if (result === 'cancelled') {
              // Người dùng đóng hộp thoại - thao tác sau sẽ hỏi lại, không thông báo ồn
          } else {
              const manualLink = ' <a href="#" onclick="downloadDataFile();return false;" class="underline font-semibold">tải thủ công</a>';
              showAutoSaveToast('Chưa tự lưu được', false, '⚠ Trình duyệt chưa cho tự lưu file —' + manualLink);
          }
      }).catch(err => {
          console.warn('Không thể tự động lưu data.js:', err);
          showAutoSaveToast('⚠ Lỗi tự động lưu data.js', false);
      });
      autoSaveQueue = task.catch(() => {});
      return autoSaveQueue;
  }

  // Lưu dự phòng: nếu trình duyệt không hỗ trợ tự lưu, người dùng vẫn tải được file
  function downloadDataFile() {
      const payload = buildDataPayload();
      const blob = new Blob([payload], { type: 'text/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = AUTO_FILE_NAME;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      try { sessionStorage.removeItem('giang_session_dirty'); } catch (err) {}
  }

  // Lưu dữ liệu: server (nếu có) → jsonbin.io trực tuyến → file offline
  function saveGalleryStore() {
      galleryDataDirty = true;
      try {
          localStorage.setItem('giang_site_data_backup', JSON.stringify(galleryStore));
          sessionStorage.setItem('giang_session_dirty', '1');
      } catch (err) { console.warn('Không lưu được bản backup cục bộ:', err); }
      pendingSaves += 1;
      const task = autoSaveQueue.then(() => {
          if (isServerMode) return syncToServer();
          // Chỉ ghi lên cloud khi đã đọc được dữ liệu cloud (tránh ghi đè khi mất kết nối)
          if (isCloudMode) {
              if (useProxy()) {
                  // Với proxy: ghi TOÀN BỘ dữ liệu chỉ dành cho admin.
                  // (Lời nhắn mới và thả tim của người dùng thường đi qua /post và /favorite.)
                  if (!isAdmin()) {
                      showAutoSaveToast('⚠ Cần quyền admin cho thao tác này', false);
                      return;
                  }
                  return syncToProxyAdmin();
              }
              return syncToJsonBin();
          }
          return syncDataToFile();
      }).catch(err => {
          console.warn('Lưu dữ liệu thất bại:', err);
          if (isServerMode) {
              showAutoSaveToast('Không gửi được lên server', false);
          } else if (isCloudMode) {
              const sizeKB = err && err.sizeKB ? err.sizeKB : Math.round(JSON.stringify(galleryStore).length / 1024);
              const isTooBig = !!(err && (err.status === 400 || err.status === 413));
              if (isTooBig) {
                  showAutoSaveToast(`⚠ Bin jsonbin đã đầy (${sizeKB}KB / giới hạn 100KB) — xoá bớt lời nhắn cũ hoặc nâng cấp jsonbin`, false);
              } else {
                  showAutoSaveToast(`Không đồng bộ được lên jsonbin.io (dữ liệu ${sizeKB}KB)`, false);
              }
          }
      }).finally(() => { pendingSaves = Math.max(0, pendingSaves - 1); });
      autoSaveQueue = task.catch(() => {});
      return autoSaveQueue;
  }

  // ==================== ĐĂNG NHẬP GOOGLE (BẮT BUỘC ĐỂ GỬI LỜI NHẮN) ====================
  // >>> ĐIỀN CLIENT ID của bạn (Google Cloud Console → OAuth client ID → Web application) <<<
    const GOOGLE_CLIENT_ID = '390847354134-gur7ga9qgd71j1uvpsdl3js716cnifk0.apps.googleusercontent.com';
  let googleUser = null;
  let googleAuthReady = false;

  function getGoogleClientConfigured() {
      return !!GOOGLE_CLIENT_ID && GOOGLE_CLIENT_ID.indexOf('thay-bang') !== 0;
  }

  // ==================== QUYỀN ADMIN (SỬA / XOÁ LỜI NHẮN) ====================
  // Thêm email Google của quản trị viên vào danh sách này (viết CHỮ THƯỜNG, đúng như email Google trả về)
  const ADMIN_EMAILS = ['n.giang06022000@gmail.com', 'bichngocng1908@gmail.com'];
  function isAdmin() {
      return !!(googleUser && googleUser.email &&
          ADMIN_EMAILS.indexOf(String(googleUser.email).toLowerCase()) !== -1);
  }

  // Giải mã payload của ID token (JWT) do Google trả về
  function decodeJwtPayload(token) {
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

  function saveGoogleUser(user) {
      try {
          if (user) localStorage.setItem('giang_google_user', JSON.stringify(user));
          else localStorage.removeItem('giang_google_user');
      } catch (err) { console.warn('Không lưu được phiên Google:', err); }
  }
  function loadGoogleUser() {
      try {
          const raw = localStorage.getItem('giang_google_user');
          if (!raw) return null;
          const saved = JSON.parse(raw);
          googleIdToken = saved && saved.idToken ? saved.idToken : null;
          // ID token của Google chỉ sống ~1 giờ. Khi dùng proxy thì BẮT BUỘC có token hợp lệ để ghi
          // dữ liệu, nên phiên hết hạn coi như chưa đăng nhập (tránh gửi rồi báo lỗi 401).
          if (useProxy()) {
              const expMs = saved && saved.exp ? Number(saved.exp) * 1000 : 0;
              if (!googleIdToken || !expMs || expMs < Date.now()) {
                  googleIdToken = null;
                  return null;
              }
          }
          return saved;
      } catch (err) { return null; }
  }

  function handleGoogleCredential(response) {
      const payload = decodeJwtPayload(response.credential);
      if (!payload) return;
      googleUser = {
          name: payload.name || payload.email || 'Người dùng Google',
          email: payload.email || '',
          picture: payload.picture || '',
          sub: payload.sub || '',
          exp: payload.exp || 0
      };
      // Lưu ID token (JWT) để proxy xác thực khi gửi lời nhắn / thả tim / thao tác admin
      googleIdToken = response.credential || null;
      saveGoogleUser({ ...googleUser, idToken: googleIdToken });
      updateGoogleAuthUI();
      renderMessages(galleryStore.messages);
      showAutoSaveToast('✓ Đã đăng nhập: ' + googleUser.name + (isAdmin() ? ' (Admin)' : ''), true);
  }

  function googleSignOut() {
      try { google.accounts.id.disableAutoSelect(); } catch (err) {}
      googleUser = null;
      googleIdToken = null;
      saveGoogleUser(null);
      updateGoogleAuthUI();
      renderMessages(galleryStore.messages);
  }

  // Cập nhật giao diện theo trạng thái đăng nhập
  function updateGoogleAuthUI() {
      const signedOut = document.getElementById('googleSignedOut');
      const signedIn = document.getElementById('googleSignedIn');
      const nameInput = document.getElementById('guestName');
      const submitBtn = document.getElementById('submitBtn');
      const note = document.getElementById('googleAuthNote');
      const loggedIn = !!googleUser;
      const box = document.getElementById('googleAuthBox');

      // Ẩn cả khung đăng nhập nếu chưa cấu hình Client ID (trang vẫn gửi ẩn danh được như cũ)
      if (box) box.classList.toggle('hidden', !getGoogleClientConfigured());
      if (signedOut) signedOut.classList.toggle('hidden', loggedIn);
      if (signedIn) {
          signedIn.classList.toggle('hidden', !loggedIn);
          signedIn.classList.toggle('flex', loggedIn);
      }
      if (note) {
          // Cảnh báo khi trang cần đăng nhập nhưng không hiển thị được nút Google (vd: mở file://)
          const showNote = !loggedIn && !googleAuthReady && getGoogleClientConfigured();
          note.classList.toggle('hidden', !showNote);
          if (showNote) note.innerText = 'Không hiển thị được nút Google — cần chạy trang trên tên miền http/https (không mở bằng file://).';
      }
      if (loggedIn) {
          const avatar = document.getElementById('googleAvatar');
          const userName = document.getElementById('googleUserName');
          if (avatar) avatar.src = googleUser.picture || '';
          if (userName) userName.innerText = googleUser.name;
          if (nameInput) { nameInput.value = googleUser.name; nameInput.readOnly = true; }
          const adminBadge = document.getElementById('googleAdminBadge');
          if (adminBadge) adminBadge.classList.toggle('hidden', !isAdmin());
      } else if (nameInput) {
          nameInput.readOnly = false;
      }
      updateAlbumAdminTools();
      // Chỉ chặn gửi khi tính năng đăng nhập thực sự khả dụng
      if (submitBtn) submitBtn.disabled = googleAuthReady && !loggedIn;
  }

  function setupGoogleAuth() {
      googleUser = loadGoogleUser();
      if (!getGoogleClientConfigured()) {
          updateGoogleAuthUI();
          return;
      }
      if (!window.google || !google.accounts || !google.accounts.id) {
          // Thư viện GIS chưa tải xong → thử lại tối đa ~5 giây
          setupGoogleAuth.tries = (setupGoogleAuth.tries || 0) + 1;
          if (setupGoogleAuth.tries <= 20) {
              setTimeout(setupGoogleAuth, 250);
          } else {
              updateGoogleAuthUI();
          }
          return;
      }
      google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: handleGoogleCredential,
          auto_select: false
      });
      const btn = document.getElementById('g_id_signin');
      if (btn) {
          google.accounts.id.renderButton(btn, {
              theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'vi', width: 240
          });
      }
      googleAuthReady = true;
      updateGoogleAuthUI();
  }

  // 2. Gửi lời nhắn mới (online: đồng bộ lên jsonbin.io — ảnh đã tải sẵn lên Cloudinary; offline: lưu data.js/local)
  function handleGuestbookSubmit(e) {
      e.preventDefault();
      const nameInput = document.getElementById('guestName');
      const msgInput = document.getElementById('guestMsg');
      if(!nameInput || !msgInput) return;

      // Bắt buộc đăng nhập Google (khi tính năng đăng nhập khả dụng)
      if (googleAuthReady && !googleUser) {
          showAutoSaveToast('⚠ Vui lòng đăng nhập bằng Google để gửi lời nhắn', false);
          return;
      }

      const name = googleUser ? googleUser.name : nameInput.value.trim();
      const message = msgInput.value.trim();
      if(!name || !message) return;

      const submitBtn = document.getElementById('submitBtn');
      const fileInput = document.getElementById('imageInput');
      if (fileInput && fileInput.files && fileInput.files.length > 0 && !selectedImageSource) {
          showAutoSaveToast('⚠ Ảnh đang tải lên, đợi chút rồi gửi lại nhé', false);
          return;
      }
      if(submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span>Đang gửi...</span>`;
      }

      const now = new Date();
      const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) + ' ' + now.toLocaleDateString('vi-VN');

      const newMessage = {
          name,
          message,
          image: selectedImageSource || null,
          email: googleUser ? googleUser.email : null,
          avatar: googleUser ? googleUser.picture : null,
          time: timeStr
      };
      galleryStore.messages.unshift(newMessage);

      if (useProxy()) {
          // Có proxy: chỉ gửi RIÊNG lời nhắn này (server tự xác thực Google rồi chèn vào bin),
          // KHÔNG ghi đè toàn bộ dữ liệu từ máy người dùng. Lỗi thì gỡ lời nhắn tạm khỏi giao diện.
          postMessageViaProxy(newMessage).catch(err => {
              console.warn('Gửi lời nhắn qua proxy thất bại:', err);
              const index = galleryStore.messages.indexOf(newMessage);
              if (index !== -1) galleryStore.messages.splice(index, 1);
              renderMessages(galleryStore.messages);
              renderMessageTopRated(galleryStore.messages);
              const hetHan = err && (err.status === 401 || err.status === 403);
              showAutoSaveToast(hetHan
                  ? '⚠ Phiên đăng nhập Google đã hết hạn — hãy đăng nhập lại rồi gửi lại'
                  : '⚠ Không gửi được lời nhắn lên máy chủ', false);
          });
      } else {
          saveGalleryStore();
      }
      renderMessages(galleryStore.messages);
      renderMessageTopRated(galleryStore.messages);

      const form = document.getElementById('guestbookForm');
      if(form) form.reset();
      removeSelectedImage();

      if(submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = `<span>Gửi</span> <i class="ph ph-paper-plane-tilt"></i>`;
      }
  }

  // 3. Hiển thị danh sách lời nhắn ra giao diện
  function renderMessages(messages) {
      const listEl = document.getElementById('messagesList');
      if(!listEl) return;

      if(!messages || messages.length === 0) {
          listEl.innerHTML = `<div class="text-xs text-gray-400 italic p-3">Chưa có lời nhắn nào cả. làm việc đi chứ!</div>`;
          renderMessageTopRated([]);
          return;
      }

      listEl.innerHTML = messages.map((item, index) => `
        <div class="message-item bg-gray-50/80 p-3.5 rounded-2xl border border-gray-100 flex flex-col gap-1" data-message-index="${index}">
            <div class="flex items-center justify-between">
                <span class="message-name font-bold text-sm text-gray-800 flex items-center gap-1.5">
                    ${isSafeAvatarUrl(item.avatar)
                        ? `<img src="${escapeHtml(item.avatar)}" alt="" loading="lazy" decoding="async" class="w-5 h-5 rounded-full border border-gray-200 object-cover">`
                        : '<i class="ph-fill ph-user-circle text-blue-500 text-base"></i>'}
                    ${escapeHtml(item.name || 'Ẩn danh')}
                    ${item.email ? '<i class="ph-fill ph-check-circle text-emerald-500 text-sm" title="Đã xác thực Google"></i>' : ''}
                </span>
                <span class="message-time text-[11px] text-gray-400">${escapeHtml(item.time || '')}</span>
            </div>
            <p class="message-content text-sm text-gray-600 pl-6">${escapeHtml(item.message || '')}</p>
            ${isSafeImageSource(item.image) ? `
                <div class="pl-6 mt-2">
                    <img src="${escapeHtml(cloudThumbUrl(item.image, THUMB_WIDTH.message))}" data-message-image="${escapeHtml(item.image)}" tabindex="0" loading="lazy" decoding="async" class="message-photo max-h-36 rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity border border-gray-200" alt="Ảnh đính kèm">
                    <button type="button" data-message-favorite-index="${index}" class="message-favorite mt-2 text-xs ${hasFavorite(item.image) ? 'text-pink-600' : 'text-gray-500'}">
                        <i class="${hasFavorite(item.image) ? 'ph-fill' : 'ph'} ph-heart"></i>
                        ${getRating(item.image).favorites} ${hasFavorite(item.image) ? 'Bỏ yêu thích' : 'Yêu thích'}
                    </button>
                </div>
            ` : ''}
            ${isAdmin() ? `
                <div class="flex items-center gap-3 mt-1 pl-6">
                    <button type="button" data-msg-edit="${index}" class="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"><i class="ph ph-pencil-simple"></i> Sửa</button>
                    <button type="button" data-msg-delete="${index}" class="text-xs font-semibold text-red-500 hover:text-red-600 flex items-center gap-1"><i class="ph ph-trash"></i> Xóa</button>
                </div>
            ` : ''}
        </div>
    `).join('');

      listEl.querySelectorAll('[data-message-image]').forEach(image => {
          // Bấm vào ảnh để mở lightbox giống album (thay cho pop-up khi rê chuột trước đây)
          const openFromMessage = () => openLightbox(image.dataset.messageImage, getMessageImageList());
          image.addEventListener('click', openFromMessage);
          image.addEventListener('keydown', event => {
              if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openFromMessage();
              }
          });
      });
      listEl.querySelectorAll('[data-message-favorite-index]').forEach(button => {
          const image = messages[Number.parseInt(button.dataset.messageFavoriteIndex, 10)]?.image;
          if (image) button.addEventListener('click', () => toggleFavorite(image));
      });
      listEl.querySelectorAll('[data-msg-edit]').forEach(button => {
          button.addEventListener('click', () => startEditMessage(Number.parseInt(button.dataset.msgEdit, 10)));
      });
      listEl.querySelectorAll('[data-msg-delete]').forEach(button => {
          button.addEventListener('click', () => deleteMessage(Number.parseInt(button.dataset.msgDelete, 10)));
      });
      renderMessageTopRated(messages);
  }

  // ==================== ADMIN: SỬA / XOÁ LỜI NHẮN ====================
  function deleteMessage(index) {
      if (!isAdmin()) return;
      const item = galleryStore.messages[index];
      if (!item) return;
      if (!window.confirm('Xoá lời nhắn này?')) return;
      galleryStore.messages.splice(index, 1);
      saveGalleryStore();
      renderMessages(galleryStore.messages);
      renderMessageTopRated(galleryStore.messages);
      showAutoSaveToast('🗑 Đã xoá lời nhắn', true);
  }

  function startEditMessage(index) {
      if (!isAdmin()) return;
      const item = galleryStore.messages[index];
      if (!item) return;
      const itemEl = document.querySelector('.message-item[data-message-index="' + index + '"]');
      const contentEl = itemEl ? itemEl.querySelector('.message-content') : null;
      if (!contentEl) return;

      const editor = document.createElement('div');
      editor.className = 'pl-6 mt-1 space-y-1';
      const textarea = document.createElement('textarea');
      textarea.rows = 2;
      textarea.value = item.message || '';
      textarea.className = 'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:border-blue-500 bg-gray-50/50';
      const bar = document.createElement('div');
      bar.className = 'flex gap-2';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg';
      saveBtn.textContent = 'Lưu';
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'text-xs font-semibold bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-lg';
      cancelBtn.textContent = 'Huỷ';
      bar.appendChild(saveBtn);
      bar.appendChild(cancelBtn);
      editor.appendChild(textarea);
      editor.appendChild(bar);
      contentEl.style.display = 'none';
      contentEl.parentNode.insertBefore(editor, contentEl.nextSibling);
      textarea.focus();

      const closeEditor = () => { editor.remove(); contentEl.style.display = ''; };
      cancelBtn.addEventListener('click', closeEditor);
      saveBtn.addEventListener('click', () => {
          const value = textarea.value.trim();
          if (!value) { closeEditor(); return; }
          item.message = value;
          saveGalleryStore();
          renderMessages(galleryStore.messages);
          renderMessageTopRated(galleryStore.messages);
          showAutoSaveToast('✏️ Đã cập nhật lời nhắn', true);
      });
  }

  function escapeHtml(text) {
      if (!text) return '';
      // Escape đầy đủ cả nháy kép/nháy đơn để an toàn khi nội suy vào thuộc tính HTML
      return text.toString()
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
  }

  // Cho phép ảnh base64 (dữ liệu cũ) hoặc URL ảnh Cloudinary đã tải lên
  function isSafeImageSource(source) {
      if (typeof source !== 'string') return false;
      if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(source)) return true;
      return /^https:\/\/res\.cloudinary\.com\/[^\s"']+$/i.test(source);
  }

  // Cho phép ảnh đại diện do Google trả về
  function isSafeAvatarUrl(source) {
      return typeof source === 'string' &&
          /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[^\s"']+$/i.test(source);
  }

  // Danh sách URL ảnh lời nhắn (để lightbox điều hướng giống album)
  function getMessageImageList() {
      const seen = new Set();
      const result = [];
      (galleryStore.messages || []).forEach(item => {
          if (isSafeImageSource(item.image) && !seen.has(item.image)) {
              seen.add(item.image);
              result.push(item.image);
          }
      });
      return result;
  }

  function getRating(image) {
      const rating = galleryStore.ratings[image];
      return rating && Number.isFinite(rating.favorites)
          ? { favorites: rating.favorites }
          : { favorites: 0 };
  }

  function hasFavorite(image) {
      return localStorage.getItem(`giang_favorite_${image}`) === '1';
  }

  function renderTopRated() {
      const list = document.getElementById('topRatedList');
      if (!list) return;
      const ranked = allGalleryImages
          .map(image => ({ image, favorites: getRating(image).favorites }))
          .filter(item => item.favorites > 0)
          .sort((a, b) => b.favorites - a.favorites)
          .slice(0, 5);
      list.innerHTML = ranked.length ? ranked.map((item, index) => `
          <button type="button" data-top-image="${escapeHtml(item.image)}" class="w-full flex items-center gap-2 text-left text-xs bg-gray-50 hover:bg-blue-50 p-2 rounded-lg transition-colors">
              <span class="font-bold text-amber-600 w-5">${index + 1}</span>
              <img src="${escapeHtml(cloudThumbUrl(item.image, THUMB_WIDTH.topRated))}" alt="" loading="lazy" decoding="async" class="w-24 h-24 rounded-lg object-cover flex-shrink-0">
              <span class="flex-1"></span>
              <span class="font-semibold text-pink-600 flex items-center gap-1"><i class="ph-fill ph-heart"></i>${item.favorites}</span>
          </button>
      `).join('') : '<p class="text-xs text-gray-400 italic">Chưa có lượt yêu thích nào.</p>';
      list.querySelectorAll('[data-top-image]').forEach(button => {
          button.addEventListener('click', () => openLightbox(button.dataset.topImage, allGalleryImages));
      });
  }

  function renderMessageTopRated(messages) {
      const list = document.getElementById('messageTopRatedList');
      if (!list) return;
      const ranked = [...new Map(
          messages
              .filter(item => isSafeImageSource(item.image))
              .map(item => [item.image, item.image])
      ).values()]
          .map(image => ({ image, favorites: getRating(image).favorites }))
          .filter(item => item.favorites > 0)
          .sort((a, b) => b.favorites - a.favorites)
          .slice(0, 5);
      list.innerHTML = ranked.length ? ranked.map((item, index) => `
          <button type="button" data-message-top-image="${escapeHtml(item.image)}" class="w-full flex items-center gap-2 text-left text-xs bg-gray-50 hover:bg-pink-50 p-2 rounded-lg transition-colors">
              <span class="font-bold text-pink-600 w-5">${index + 1}</span>
              <img src="${escapeHtml(cloudThumbUrl(item.image, THUMB_WIDTH.topRated))}" alt="Ảnh lời nhắn" loading="lazy" decoding="async" class="w-24 h-24 rounded-lg object-cover flex-shrink-0">
              <span class="flex-1"></span>
              <span class="font-semibold text-pink-600 flex items-center gap-1"><i class="ph-fill ph-heart"></i>${item.favorites}</span>
          </button>
      `).join('') : '<p class="text-xs text-gray-400 italic">Chưa có ảnh lời nhắn được yêu thích.</p>';
      list.querySelectorAll('[data-message-top-image]').forEach(button => {
          button.addEventListener('click', () => openLightbox(button.dataset.messageTopImage, getMessageImageList()));
      });
  }

  function renderAlbumItems(images, label) {
      const gridList = document.getElementById('albumGridList');
      if (!gridList) return;
      gridList.innerHTML = images.map((imgSrc, index) => {
          const rating = getRating(imgSrc);
          const favorited = hasFavorite(imgSrc);
          return `
              <div class="rounded-2xl overflow-hidden bg-gray-100 shadow-sm relative">
                  <button type="button" data-gallery-image="${escapeHtml(imgSrc)}" class="block w-full aspect-square cursor-pointer group">
                      <img src="${escapeHtml(cloudThumbUrl(imgSrc, THUMB_WIDTH.grid))}" alt="${label} ${index + 1}" loading="lazy" decoding="async" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.closest('div').style.display='none'">
                  </button>
                  ${isAdmin() ? `
                  <div class="absolute top-1.5 right-1.5 flex gap-1.5 z-10">
                      <button type="button" data-album-download="${escapeHtml(imgSrc)}" title="Tải xuống" class="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/80 transition-colors"><i class="ph ph-download-simple text-sm"></i></button>
                      <button type="button" data-album-delete="${escapeHtml(imgSrc)}" title="Xoá khỏi album" class="w-7 h-7 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-red-600 transition-colors"><i class="ph ph-trash text-sm"></i></button>
                  </div>` : ''}
                  <div class="bg-white p-2">
                      <div class="flex items-center justify-between gap-1">
                          <span class="text-xs text-gray-400">${rating.favorites} yêu thích</span>
                          <button type="button" data-favorite-image="${escapeHtml(imgSrc)}" class="text-[11px] ${favorited ? 'text-pink-600' : 'text-gray-500'}" aria-label="${favorited ? 'Bỏ yêu thích ảnh' : 'Yêu thích ảnh'}">
                              <i class="${favorited ? 'ph-fill' : 'ph'} ph-heart"></i> ${favorited ? 'Bỏ yêu thích' : 'Yêu thích'}
                          </button>
                      </div>
                  </div>
              </div>
          `;
      }).join('');
      gridList.querySelectorAll('[data-gallery-image]').forEach(button => {
          button.addEventListener('click', () => openLightbox(button.dataset.galleryImage, images));
      });
      gridList.querySelectorAll('[data-favorite-image]').forEach(button => {
          button.addEventListener('click', () => toggleFavorite(button.dataset.favoriteImage));
      });
      gridList.querySelectorAll('[data-album-download]').forEach(button => {
          button.addEventListener('click', event => { event.stopPropagation(); downloadAlbumImage(button.dataset.albumDownload); });
      });
      gridList.querySelectorAll('[data-album-delete]').forEach(button => {
          button.addEventListener('click', event => { event.stopPropagation(); deleteAlbumImage(button.dataset.albumDelete); });
      });
  }

  // ==================== ADMIN: TẢI LÊN / TẢI XUỐNG / XOÁ ẢNH ALBUM ====================
  function updateAlbumAdminTools() {
      const tools = document.getElementById('albumAdminTools');
      if (!tools) return;
      tools.classList.toggle('hidden', !isAdmin());
      tools.classList.toggle('flex', isAdmin());
  }

  async function handleAlbumUpload(input) {
      if (!isAdmin()) return;
      const files = Array.from(input.files || []);
      input.value = '';
      const imageFiles = files.filter(f => f.type.startsWith('image/'));
      if (!imageFiles.length) { showAutoSaveToast('⚠ Chỉ nhận file ảnh', false); return; }

      const albumKey = activeAlbumLabel === 'Ảnh hậu trường' ? 'bts' : 'albummeme';
      const folder = CLOUDINARY_ALBUM_FOLDERS[albumKey];
      const preset = CLOUDINARY_ALBUM_PRESETS[albumKey] || CLOUDINARY_UPLOAD_PRESET;
      const statusEl = document.getElementById('albumUploadStatus');

      if (!galleryStore.albums) galleryStore.albums = { bts: [], albummeme: [] };
      if (!Array.isArray(galleryStore.albums[albumKey])) galleryStore.albums[albumKey] = [];

      let ok = 0;
      for (let i = 0; i < imageFiles.length; i += 1) {
          if (statusEl) statusEl.innerText = `Đang tải ${i + 1}/${imageFiles.length}...`;
          try {
              const blob = await compressImage(imageFiles[i], ALBUM_IMAGE_MAX_DIMENSION, ALBUM_IMAGE_MAX_BYTES);
              const url = await uploadToCloudinary(blob, folder, albumKey, preset);
              galleryStore.albums[albumKey].push(url);
              ok += 1;
          } catch (err) {
              console.error('Tải ảnh album lên thất bại:', err);
          }
      }
      if (statusEl) statusEl.innerText = '';

      if (ok > 0) {
          saveGalleryStore();
          setAlbumImages(galleryStore.albums);
          refreshOpenAlbumModal();
          renderTopRated();
          showAutoSaveToast(`✓ Đã thêm ${ok} ảnh vào album`, true);
      } else {
          showAutoSaveToast('⚠ Không tải được ảnh nào', false);
      }
  }

  function downloadAlbumImage(url) {
      let href = url;
      // Ảnh Cloudinary: thêm fl_attachment để buộc tải xuống (ảnh khác tên miền vẫn tải được)
      if (/^https:\/\/res\.cloudinary\.com\//i.test(url)) {
          href = url.replace('/image/upload/', '/image/upload/fl_attachment/');
      }
      const link = document.createElement('a');
      link.href = href;
      link.download = 'album-' + Date.now() + '.jpg';
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  }

  function deleteAlbumImage(url) {
      if (!isAdmin()) return;
      if (!window.confirm('Xoá ảnh này khỏi album?\n(Ảnh vẫn còn trên Cloudinary, chỉ gỡ khỏi danh sách hiển thị)')) return;
      let removed = false;
      ['bts', 'albummeme'].forEach(key => {
          const arr = galleryStore.albums && galleryStore.albums[key];
          if (Array.isArray(arr)) {
              const i = arr.indexOf(url);
              if (i !== -1) { arr.splice(i, 1); removed = true; }
          }
      });
      if (!removed) return;
      saveGalleryStore();
      setAlbumImages(galleryStore.albums);
      refreshOpenAlbumModal();
      renderTopRated();
      showAutoSaveToast('🗑 Đã xoá ảnh khỏi album', true);
  }

  function refreshAlbum() {
      renderAlbumItems(activeAlbumImages, activeAlbumLabel);
      renderTopRated();
      renderMessageTopRated(galleryStore.messages);
  }

  // Gộp các lần bấm yêu thích liên tiếp thành MỘT lần lưu lên cloud (đỡ request, tránh lỗi 429/quota).
  // Bản dự phòng cục bộ vẫn được ghi ngay nên không sợ mất dữ liệu.
  let pendingSaveTimer = null;
  function scheduleGallerySave(delay) {
      try { localStorage.setItem('giang_site_data_backup', JSON.stringify(galleryStore)); } catch (err) {}
      if (pendingSaveTimer) clearTimeout(pendingSaveTimer);
      pendingSaveTimer = setTimeout(() => {
          pendingSaveTimer = null;
          saveGalleryStore();
      }, typeof delay === 'number' ? delay : 800);
  }
  function flushScheduledSave() {
      if (!pendingSaveTimer) return;
      clearTimeout(pendingSaveTimer);
      pendingSaveTimer = null;
      saveGalleryStore();
  }
  // Đóng tab / rời tab: gửi ngay phần đang chờ để không mất lượt yêu thích vừa bấm
  window.addEventListener('pagehide', () => { flushScheduledSave(); sendPendingFavorites(); });
  document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { flushScheduledSave(); sendPendingFavorites(); }
  });

  function toggleFavorite(image) {
      const rating = getRating(image);
      const active = hasFavorite(image);
      rating.favorites = Math.max(0, rating.favorites + (active ? -1 : 1));
      galleryStore.ratings[image] = rating;
      localStorage.setItem(`giang_favorite_${image}`, active ? '0' : '1');
      if (useProxy()) queueProxyFavoriteChange(image, active ? -1 : 1);
      else scheduleGallerySave();
      refreshAlbum();
      renderMessages(galleryStore.messages);
  }

  // (Khi dùng proxy) Gộp nhiều lần thả tim liên tiếp thành 1 request, chỉ gửi tổng chênh lệch ±1 cho từng ảnh
  const pendingFavoriteDeltas = {};
  let favoriteProxyTimer = null;
  function queueProxyFavoriteChange(image, delta) {
      pendingFavoriteDeltas[image] = (pendingFavoriteDeltas[image] || 0) + delta;
      try { localStorage.setItem('giang_site_data_backup', JSON.stringify(galleryStore)); } catch (err) {}
      if (favoriteProxyTimer) clearTimeout(favoriteProxyTimer);
      favoriteProxyTimer = setTimeout(sendPendingFavorites, 800);
  }
  function sendPendingFavorites() {
      if (favoriteProxyTimer) { clearTimeout(favoriteProxyTimer); favoriteProxyTimer = null; }
      const deltas = Object.keys(pendingFavoriteDeltas).map(image => ({ image, delta: pendingFavoriteDeltas[image] }));
      if (!deltas.length) return;
      Object.keys(pendingFavoriteDeltas).forEach(key => { delete pendingFavoriteDeltas[key]; });
      syncFavoritesViaProxy(deltas).catch(err => {
          console.warn('Đồng bộ lượt yêu thích qua proxy thất bại:', err);
          showAutoSaveToast('⚠ Không đồng bộ được lượt yêu thích', false);
      });
  }

  // ==================== XỬ LÝ ALBUM ẢNH & LIGHTBOX ====================

  // A11y: nhớ nơi đang có tiêu điểm, đưa tiêu điểm vào modal khi mở, trả lại khi đóng,
  // và giữ phím Tab luẩn quẩn trong modal đang mở.
  let focusedBeforeModal = null;
  function focusModal(modal) {
      focusedBeforeModal = document.activeElement;
      if (!modal) return;
      const target = modal.querySelector('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])');
      if (target) target.focus();
  }
  function restoreFocusAfterModal() {
      const el = focusedBeforeModal;
      focusedBeforeModal = null;
      if (el && typeof el.focus === 'function') el.focus();
  }
  function trapFocusInside(event, modal) {
      if (event.key !== 'Tab' || !modal) return;
      const nodes = modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // Mở modal chứa lưới ảnh của Album Meme
  function openAlbumModal() {
    const titleEl = document.getElementById('albumModalTitle');
    if(titleEl) titleEl.innerText = "Album Meme của Giang";

    const memeList = albumImages.albummeme;

    activeAlbumImages = memeList;
    activeAlbumLabel = 'Ảnh meme';
    updateAlbumAdminTools();
    renderAlbumItems(memeList, 'Ảnh meme');
    renderTopRated();

    const modal = document.getElementById('albumModal');
    if(modal) {
        modal.classList.add('flex');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        focusModal(modal);
    }
  }

  function openBtsAlbumModal() {
    const titleEl = document.getElementById('albumModalTitle');
    if (titleEl) titleEl.innerText = 'Album Hậu trường';

    const btsList = albumImages.bts;

    activeAlbumImages = btsList;
    activeAlbumLabel = 'Ảnh hậu trường';
    updateAlbumAdminTools();
    renderAlbumItems(btsList, 'Ảnh hậu trường');
    renderTopRated();

    const modal = document.getElementById('albumModal');
    if (modal) {
        modal.classList.add('flex');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        focusModal(modal);
    }
  }

  // Đóng modal lưới album ảnh
  function closeAlbumModal() {
    const modal = document.getElementById('albumModal');
    if(modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        document.body.style.overflow = '';
    }
    restoreFocusAfterModal();
  }

  // Mở cửa sổ Lightbox xem phóng to một ảnh cụ thể (hoặc từ lời nhắn)
  function openLightbox(imgSrc, list) {
    // Danh sách để điều hướng: ảnh lời nhắn / album / bảng xếp hạng tuỳ nơi gọi
    lightboxList = (Array.isArray(list) && list.length) ? list.slice() : allGalleryImages.slice();
    currentIndex = lightboxList.indexOf(imgSrc);
    if (currentIndex === -1) {
        lightboxList = [imgSrc];
        currentIndex = 0;
    }

    const modalImg = document.getElementById('modalImg');
    if(modalImg) modalImg.src = lightboxList[currentIndex];

    const imgModal = document.getElementById('imageModal');
    if(imgModal) {
        imgModal.classList.add('flex');
        imgModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        focusModal(imgModal);
    }
  }

  // Đóng cửa sổ phóng to ảnh Lightbox
  function closeModal() {
    const imgModal = document.getElementById('imageModal');
    if(imgModal) {
        imgModal.classList.add('hidden');
        imgModal.classList.remove('flex');
        // Chỉ mở lại cuộn trang khi phía dưới không còn modal album nào đang mở
        const albumModal = document.getElementById('albumModal');
        if (!albumModal || albumModal.classList.contains('hidden')) document.body.style.overflow = '';
    }
    restoreFocusAfterModal();
  }

  // Chuyển sang ảnh kế tiếp trong Lightbox
  function nextImage(event) {
    if (event) event.stopPropagation();
    if (lightboxList.length === 0) return;
    currentIndex = (currentIndex + 1) % lightboxList.length;
    const modalImg = document.getElementById('modalImg');
    if(modalImg) modalImg.src = lightboxList[currentIndex];
  }

  // Quay lại ảnh trước đó trong Lightbox
  function prevImage(event) {
    if (event) event.stopPropagation();
    if (lightboxList.length === 0) return;
    currentIndex = (currentIndex - 1 + lightboxList.length) % lightboxList.length;
    const modalImg = document.getElementById('modalImg');
    if(modalImg) modalImg.src = lightboxList[currentIndex];
  }

  // Phím tắt: ESC đóng modal đang mở (lightbox trước, rồi tới modal album), mũi tên chuyển ảnh,
  // Tab được giữ luẩn quẩn trong modal đang mở.
  document.addEventListener('keydown', function(event) {
    const albumModal = document.getElementById('albumModal');
    const imgModal = document.getElementById('imageModal');
    const albumOpen = !!(albumModal && !albumModal.classList.contains('hidden'));
    const lightboxOpen = !!(imgModal && !imgModal.classList.contains('hidden'));

    if (event.key === 'Escape') {
      if (lightboxOpen) { closeModal(); return; }   // lightbox nằm trên modal album
      if (albumOpen) { closeAlbumModal(); }
      return;
    }
    if (albumOpen) { trapFocusInside(event, albumModal); return; }
    if (!lightboxOpen) return;
    trapFocusInside(event, imgModal);
    if (event.key === 'ArrowRight') nextImage();
    else if (event.key === 'ArrowLeft') prevImage();
  });

  // Tự động cập nhật số lượng ảnh hiển thị lên badge và render danh sách thiết bị khi tải trang xong
  document.addEventListener("DOMContentLoaded", function() {
    setupThemeToggle();
    setupGoogleAuth();
    loadAlbumImages().catch(error => {
        console.error('Không thể đồng bộ ảnh album:', error);
    });
    if (window.location.protocol !== 'file:') {
        // Tối ưu: giảm tần suất làm mới album từ 30s → 5 phút để tiết kiệm request/pin.
        // Vẫn làm mới ngay khi người dùng quay lại tab (xử lý ở visibilitychange bên dưới).
        window.setInterval(() => {
            if (document.visibilityState !== 'visible') return;
            loadAlbumImages().catch(error => {
                console.error('Không thể cập nhật ảnh album:', error);
            });
        }, 300000);
    }
    setupImageDropZone();
    setupDonateQrEffect();
    setupAvatarPopup();
    if (window.location.protocol !== 'file:') {
        const youtubeFrame = document.querySelector('iframe[title="Video Hoa hậu sinh viên"]');
        if (youtubeFrame) {
            const url = new URL(youtubeFrame.src);
            url.searchParams.set('origin', window.location.origin);
            youtubeFrame.src = url.toString();
        }
    }

    // Khi quay lại tab, làm mới lời nhắn/lượt thích từ jsonbin.io để đồng bộ giữa các thiết bị
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshFromCloud();
    });

    updateAlbumCountBadges();
    // Cập nhật lượt truy cập theo từng trình duyệt.
    let visits = Number.parseInt(localStorage.getItem('giang_visit_count'), 10);
    if (!Number.isFinite(visits)) visits = 1428;
    else visits += 1;
    localStorage.setItem('giang_visit_count', String(visits));
    const visitEl = document.getElementById('visitCount');
    if (visitEl) visitEl.innerText = visits.toLocaleString('vi-VN');

    (async function initDataLoader() {
        // 1) Nếu đang được server.js (mini PC) phục vụ → tự động đồng bộ, gửi nhận đều lên server
        if (await detectServerMode()) {
            return;
        }
        // 2) Nếu đã cấu hình jsonbin.io → đồng bộ trực tuyến lời nhắn + ảnh
        try {
            if (await detectCloudMode()) {
                return;
            }
        } catch (err) {
            console.warn('Không đọc được dữ liệu từ jsonbin.io, dùng dữ liệu cục bộ:', err);
            showAutoSaveToast('⚠ Chưa kết nối được jsonbin.io — đang dùng dữ liệu cục bộ', false);
        }
        // 3) Không có server & cloud → dữ liệu lấy từ data.js trong cùng thư mục (mở file://)
        fetchMessagesFromLocalData();
        try {
            const DirtyFlag = sessionStorage.getItem('giang_session_dirty') === '1';
            const backup = localStorage.getItem('giang_site_data_backup');
            if (DirtyFlag && backup && window.SITE_DATA) {
                const parsed = JSON.parse(backup);
                const merged = normalizeGalleryStore(parsed);
                if (JSON.stringify(merged.messages) !== JSON.stringify(galleryStore.messages)
                    || JSON.stringify(merged.ratings) !== JSON.stringify(galleryStore.ratings)) {
                    galleryStore = merged;
                    galleryDataDirty = true;
                    renderMessages(galleryStore.messages);
                    renderTopRated();
                    renderMessageTopRated(galleryStore.messages);
                }
            }
        } catch (err) { console.warn('Bỏ qua khôi phục backup cục bộ:', err); }
        if (galleryDataDirty) syncDataToFile();
    })();
  });

  function setupThemeToggle() {
    const button = document.getElementById('themeToggle');
    if (!button) return;
    const root = document.documentElement;
    const icon = button.querySelector('i');
    const update = isDark => {
      root.classList.toggle('dark-theme', isDark);
      document.body.classList.toggle('dark-theme', isDark);
      button.setAttribute('aria-label', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
      button.setAttribute('title', isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
      if (icon) {
        icon.classList.toggle('ph-moon', !isDark);
        icon.classList.toggle('ph-sun', isDark);
      }
    };
    update(root.classList.contains('dark-theme'));
    button.addEventListener('click', () => {
      const isDark = !root.classList.contains('dark-theme');
      localStorage.setItem('giang_theme', isDark ? 'dark' : 'light');
      update(isDark);
    });
  }

  function setupAvatarPopup() {
    const group = document.querySelector('.avatar-hover-group');
    const overlay = group?.querySelector('.avatar-hover-overlay');
    const image = group?.querySelector('.avatar-hover-image');
    if (!group || !overlay || !image) return;

    document.body.append(overlay, image);
    const close = () => {
      overlay.classList.remove('is-visible');
      image.classList.remove('is-visible');
      document.body.style.overflow = '';
    };
    const open = () => {
      overlay.classList.add('is-visible');
      image.classList.add('is-visible');
      document.body.style.overflow = 'hidden';
    };

    group.addEventListener('mouseenter', open);
    group.addEventListener('mouseleave', close);
    group.addEventListener('click', () => {
      open();
    });
    document.addEventListener('click', event => {
      if (!group.contains(event.target) && event.target !== image) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') close();
    });
  }