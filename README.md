# Yuksalamiz Platform

Telegram bot + Telegram Mini App + FastAPI backend (Supabase: PostgreSQL + Storage).

## Tarkib
- `backend/` — FastAPI API, Telegram initData tekshiruvi, bot (aiogram 3, webhook), kitob yuklash va PDF ishlovi.
- `frontend/` — React + Vite Mini App: bosh sahifa, kutubxona, o'qish (reader), reyting, profil va admin panel.
- `database/schema.sql` — to'liq sxema (yangi o'rnatish). `database/migrations/` — mavjud bazani yangilash.
- `docs/` — katta PDF yuklash va rivojlanish rejasi.

## 1. Kerakli narsalar
Python 3.11+, Node.js 20+, BotFather'dan bot tokeni, Supabase project (URL va service-role key).

## 2. Supabase
1. SQL Editor'da `database/schema.sql` ni ishga tushiring.
   **Eski versiyadan o'tayotgan bo'lsangiz** — o'rniga `database/migrations/002_v03_upgrade.sql` ni ishga tushiring.
2. Storage'da `books` nomli **private** bucket yarating.
3. Storage → Settings'da maksimal fayl hajmini (file size limit) kerakli qiymatgacha oshiring (bepul rejada 50 MB).

## 3. Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # qiymatlarni to'ldiring
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## 4. Mini App
```bash
cd frontend
npm install
cp .env.example .env        # VITE_API_BASE = backend manzili
npm run dev                 # yoki: npm run build
```
Mini App Telegram ichida faqat **HTTPS** manzilda ishlaydi. Build (`dist/`) ni Vercel/Netlify/Cloudflare Pages'ga joylang va manzilni `FRONTEND_ORIGIN` ga yozing.

## 5. Webhook
`WEBHOOK_BASE_URL` va `TELEGRAM_WEBHOOK_SECRET` berilsa, webhook server ishga tushganda **avtomatik** o'rnatiladi.
Qo'lda o'rnatish kerak bo'lsa (secret bilan himoyalangan):
```bash
curl -X POST https://BACKEND/webhook/set \
  -H "Authorization: Bearer $TELEGRAM_WEBHOOK_SECRET" -H "Content-Type: application/json" \
  -d '{"webhook_url":"https://BACKEND/webhook/telegram"}'
```

## Kitob yuklash qanday ishlaydi
1. Admin fayl yuboradi (progress ko'rsatiladi). Fayl turi **imzo (magic bytes)** bo'yicha tekshiriladi.
2. Server faylni qabul qilib darhol `202` qaytaradi, qolgan ishni **fonda** bajaradi: original saqlanadi, sahifalar JPEG'ga aylantiriladi (kenglik 1100 px), alohida kichik muqova yaratiladi.
3. Admin panelda holat jonli ko'rinadi: *Ishlanmoqda 120/600 → Tayyor*. Xato bo'lsa, yuklangan fayllar avtomatik tozalanadi va sabab ko'rsatiladi.
4. Reader sahifalarni bo'lak-bo'lak (15 tadan) va faqat kerak bo'lganda yuklaydi, o'qish joyi saqlanadi.

## Muhim
- Token, service-role key va admin ID'larni GitHub'ga joylamang.
- Admin huquqi har bir endpointda backend tomonda tekshiriladi.
- Fon ishlovi bitta server jarayonida ishlaydi. Server qayta ishga tushsa, yarim qolgan kitoblar "Xato" deb belgilanadi — qayta yuklang. Juda katta importlar uchun keyinchalik alohida worker/navbat (masalan, Redis + RQ) tavsiya etiladi.
- Render'da RAM/disk/timeout limitlari va Supabase obyekt hajmi limiti ham amal qiladi.
