window.SITE_DATA = {
    messages: [],
    ratings: {
        // Khoá theo đường dẫn ảnh cục bộ (dùng khi offline, ảnh lấy từ thư mục image/)
        "image/albummeme/1 (1).jpg": { favorites: 1 },
        "image/albummeme/1 (2).jpg": { favorites: 1 },
        "image/albummeme/1 (3).jpg": { favorites: 1 },
        // Khoá theo URL Cloudinary (dùng khi online)
        "https://res.cloudinary.com/g9uxwrbl/image/upload/v1789039666/giang-loi-nhan/loi-nhan.jpg": { favorites: 1 },
        "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-1.jpg": { favorites: 1 },
        "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-2.jpg": { favorites: 1 },
        "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-3.jpg": { favorites: 1 }
    },
    // Ảnh album dùng URL Cloudinary KHÔNG kèm version: nếu upload lại đúng tên file
    // (album-bts-1..4, album-meme-1..4) thì link cũ vẫn dùng được, không phải sửa file này.
    albums: {
        bts: [
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-bts-1.jpg",
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-bts-2.jpg",
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-bts-3.jpg",
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-bts-4.jpg"
        ],
        albummeme: [
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-1.jpg",
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-2.jpg",
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-3.jpg",
            "https://res.cloudinary.com/g9uxwrbl/image/upload/album-meme-4.jpg"
        ]
    }
};
