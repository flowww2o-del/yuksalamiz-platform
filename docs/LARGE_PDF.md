# Katta PDF

- `MAX_BOOK_UPLOAD_MB` (standart `2048`) — ilova darajasidagi limit. `backend/.env` yoki Render Environment orqali sozlanadi.
- Sahifalar soniga qattiq limit yo'q. Fayl diskka 8 MB bo'laklarda yoziladi, so'ng fonda qayta ishlanadi.
- Render'da diskda fayl hajmiga teng bo'sh joy kerak (vaqtinchalik fayl ishlov tugagach o'chiriladi).
- Supabase Storage'da bucket/umumiy fayl hajmi limitini oshiring, aks holda original yuklashda 413 xatosi chiqadi.
- Sifat sozlamalari: `PAGE_TARGET_WIDTH`, `PAGE_JPEG_QUALITY`, `COVER_WIDTH`, `UPLOAD_CONCURRENCY`.
