/**
 * =====================================================================================
 *  PROXY BẢO MẬT cho trang cá nhân Giang Nguyễn  (Cloudflare Worker)
 * =====================================================================================
 *  Mục đích: giữ khoá jsonbin ở PHÍA SERVER → file web không còn khoá, người lạ không thể
 *            ghi đè/xoá bin. Người dùng thường chỉ có thể: đọc dữ liệu, gửi 1 lời nhắn,
 *            thả/bỏ tim (mỗi lần ±1). Sửa/xoá lời nhắn & quản lý album: chỉ email admin.
 *
 *  Cấu hình (Cloudflare Dashboard → Workers & Pages → Worker của bạn → Settings → Variables):
 *    - JSONBIN_MASTER_KEY  : Secret  (BẮT BUỘC) – khoá master jsonbin.io
 *    - JSONBIN_BIN_ID      : Text    (tuỳ chọn) – mặc định dùng bin của trang
 *    - ADMIN_EMAILS        : Text    (tuỳ chọn) – danh sách email admin, cách nhau dấu phẩy
 *    - ALLOWED_ORIGINS     : Text    (tuỳ chọn) – các origin được phép, cách nhau dấu phẩy.
 *                            Để trống = cho phép mọi origin (tiện khi mở trang bằng file://).
 *
 *  API:
 *    GET  /data     → { record: { messages, ratings, albums, projects } }
 *    POST /post     → { message: {message, image, time} } + header X-Google-Token
 *    POST /favorite → { deltas: [{ image, delta }] }      + header X-Google-Token
 *    POST /admin    → { store }                           + header X-Google-Token (phải là admin)
 * =====================================================================================
 */

const DEFAULT_BIN_ID = '6a9fd4f2ac6210605ab2e044';
const DEFAULT_ADMIN_EMAILS = 'n.giang06022000@gmail.com,bichngocng1908@gmail.com';
const GOOGLE_TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
const MAX_MESSAGES = 150;      // số lời nhắn tối đa giữ lại (bin free chỉ ~100KB)
const MAX_MESSAGE_LEN = 1000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (request.method === 'GET' && (url.pathname === '/data' || url.pathname === '/')) {
        return json(await readBin(env), cors);
      }
      if (request.method === 'POST' && url.pathname === '/post') {
        return json(await handlePost(request, env, await readJson(request)), cors);
      }
      if (request.method === 'POST' && url.pathname === '/favorite') {
        return json(await handleFavorite(request, env, await readJson(request)), cors);
      }
      if (request.method === 'POST' && url.pathname === '/admin') {
        return json(await handleAdmin(request, env, await readJson(request)), cors);
      }
      return json({ error: 'Không tìm thấy đường dẫn ' + url.pathname }, cors, 404);
    } catch (err) {
      const status = err && err.status ? err.status : 500;
      return json({ error: String((err && err.message) || err) }, cors, status);
    }
  }
};

// ----- CORS -----
// ----- CORS -----
// Đọc JSON từ request, trả lỗi 400 rõ ràng nếu dữ liệu không phải JSON hợp lệ
async function readJson(request) {
  try { return await request.json(); }
  catch (err) { throw httpError(400, 'Dữ liệu gửi lên không phải JSON hợp lệ'); }
}

function corsHeaders(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin') || '';
  let allow = '*';
  if (allowed.indexOf('*') !== -1) {
    // Có '*' trong danh sách = cho phép MỌI origin (kể cả mở file:// trực tiếp trên máy)
    allow = origin || '*';
  } else if (allowed.length) {
    allow = allowed.includes(origin) ? origin : allowed[0];
  } else if (origin) {
    allow = origin;
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Google-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, cors, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({}, cors, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    })
  });
}

// ----- jsonbin -----
function binId(env) { return env.JSONBIN_BIN_ID || DEFAULT_BIN_ID; }

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || DEFAULT_ADMIN_EMAILS).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function readBin(env) {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId(env)}/latest`, {
    headers: { 'X-Master-Key': env.JSONBIN_MASTER_KEY },
    cache: 'no-store'
  });
  if (!res.ok) throw new Error('Đọc jsonbin thất bại: ' + res.status);
  return res.json();
}

async function writeBin(env, store) {
  const res = await fetch(`https://api.jsonbin.io/v3/b/${binId(env)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Master-Key': env.JSONBIN_MASTER_KEY },
    body: JSON.stringify(store)
  });
  if (!res.ok) {
    const them = (res.status === 400 || res.status === 413) ? ' (có thể do dữ liệu vượt giới hạn ~100KB của bin free)' : '';
    throw new Error('Ghi jsonbin thất bại: ' + res.status + them);
  }
  return res.json();
}

function normStore(record) {
  const r = record && record.record ? record.record : (record || {});
  const albums = (r && r.albums && typeof r.albums === 'object') ? r.albums : {};
  const store = {
    messages: Array.isArray(r.messages) ? r.messages : [],
    ratings: (r.ratings && typeof r.ratings === 'object') ? r.ratings : {},
    albums: {
      bts: Array.isArray(albums.bts) ? albums.bts : [],
      albummeme: Array.isArray(albums.albummeme) ? albums.albummeme : []
    }
  };

  // ===== KHO DỰ ÁN (trang du-an) — KHÔNG ĐƯỢC BỎ QUA =====
  // `projects` là dữ liệu của Kho Dự án (du-an/index.html + du-an/du-an.js): danh sách dự án kèm
  // URL ảnh/video đã tải lên Cloudinary. Vì `normStore` là DANH SÁCH TRẮNG (whitelist), thiếu khoá
  // này thì MỖI lần ghi bin (gửi lời nhắn, thả tim, admin lưu) khoá đó bị XOÁ SẠCH khỏi jsonbin →
  // trang Dự án báo "cloud đã nhận nhưng KHÔNG trả về khoá projects" và ảnh vừa thêm bị mất.
  //   • mảng (kể cả []) = dữ liệu thật của admin → giữ nguyên như bản gửi lên
  //   • null            = "chưa tuỳ chỉnh" (trang du-an dùng 5 danh mục mặc định) → giữ null
  if (hasProjectsKey(r)) store.projects = normProjects(r);

  return store;
}

// null = nguồn dữ liệu KHÔNG có khoá `projects` (chưa tuỳ chỉnh) | mảng = dữ liệu thật của admin
function normProjects(r) {
  const list = r && r.projects;
  if (!Array.isArray(list)) return null;
  return list.filter(function (item) {
    return item && typeof item === 'object' && String(item.title || '').trim();
  });
}

function hasProjectsKey(r) {
  return !!r && Object.prototype.hasOwnProperty.call(r, 'projects');
}

// ----- Google: xác thực ID token bằng endpoint tokeninfo (không cần thư viện) -----
async function verifyGoogle(request) {
  const token = request.headers.get('X-Google-Token');
  if (!token) throw httpError(401, 'Thiếu token đăng nhập Google');
  const res = await fetch(GOOGLE_TOKENINFO + encodeURIComponent(token));
  if (!res.ok) throw httpError(401, 'Token Google không hợp lệ hoặc đã hết hạn');
  const info = await res.json();
  if (!info || !info.email) throw httpError(401, 'Token Google không có email');
  // (Tuỳ chọn) chỉ nhận token phát hành cho đúng ứng dụng của trang
  if (env.GOOGLE_CLIENT_ID && info.aud !== env.GOOGLE_CLIENT_ID) {
    throw httpError(401, 'Token Google không thuộc ứng dụng này');
  }
  return {
    email: String(info.email).toLowerCase(),
    name: info.name || info.email,
    picture: info.picture || ''
  };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clip(value, max) { return String(value == null ? '' : value).slice(0, max); }

function isCloudinaryUrl(url) {
  return typeof url === 'string' && url.length < 600 && /^https:\/\/res\.cloudinary\.com\/[^\s"']+$/i.test(url);
}

// ===================== CÁC THAO TÁC =====================

// Gửi 1 lời nhắn mới: xác thực Google → chèn vào bin (không cho ghi đè toàn bộ dữ liệu)
async function handlePost(request, env, body) {
  const user = await verifyGoogle(request);
  const input = (body && body.message) || {};
  const text = clip(input.message, MAX_MESSAGE_LEN).trim();
  if (!text) throw httpError(400, 'Lời nhắn trống');

  const store = normStore(await readBin(env));
  store.messages.unshift({
    name: clip(user.name, 80),
    message: text,
    image: isCloudinaryUrl(input.image) ? input.image : null,
    email: user.email,
    avatar: /^https:\/\//i.test(user.picture) ? clip(user.picture, 400) : null,
    time: clip(input.time, 40)
  });
  if (store.messages.length > MAX_MESSAGES) store.messages.length = MAX_MESSAGES;

  const saved = await writeBin(env, store);
  return { record: normStore(saved) };
}

// Thả/bỏ tim: chỉ cho cộng/trừ ĐÚNG 1 đơn vị cho mỗi ảnh trong 1 lần gọi
async function handleFavorite(request, env, body) {
  await verifyGoogle(request);
  const deltas = Array.isArray(body && body.deltas) ? body.deltas.slice(0, 50) : [];
  const store = normStore(await readBin(env));
  let changed = 0;

  deltas.forEach(function (item) {
    const image = item && item.image;
    const delta = Number(item && item.delta);
    if (typeof image !== 'string' || !image || image.length > 600) return;
    if (delta !== 1 && delta !== -1) return;
    const current = store.ratings[image] && Number.isFinite(store.ratings[image].favorites)
      ? store.ratings[image].favorites : 0;
    store.ratings[image] = { favorites: Math.max(0, current + delta) };
    changed += 1;
  });

  const saved = changed ? await writeBin(env, store) : { record: store };
  return { record: normStore(saved) };
}

// Ghi toàn bộ dữ liệu (sửa/xoá lời nhắn, thêm/xoá ảnh album): CHỈ email admin
async function handleAdmin(request, env, body) {
  const user = await verifyGoogle(request);
  if (adminEmails(env).indexOf(user.email) === -1) {
    throw httpError(403, 'Tài khoản này không phải quản trị viên');
  }
  const input = body && body.store;
  if (!input || typeof input !== 'object') throw httpError(400, 'Thiếu dữ liệu cần lưu');

  // An toàn chống mất dữ liệu: nếu bản gửi lên KHÔNG có khoá `projects` (ví dụ trình duyệt còn
  // cache bản du-an.js/app.js cũ) thì GIỮ NGUYÊN Kho Dự án đang có trong bin, không xoá đi.
  const next = normStore(input);
  if (!hasProjectsKey(input)) {
    const current = normStore(await readBin(env));
    if (hasProjectsKey(current)) next.projects = current.projects;
  }

  const saved = await writeBin(env, next);
  return { record: normStore(saved) };
}
