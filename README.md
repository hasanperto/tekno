# TeknoProje Backend API

TeknoProje platformu için Node.js/Express backend API.

## 🚀 Kurulum

### Yerel Geliştirme

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. `.env` dosyası oluşturun (`.env.example` dosyasını kopyalayın):
```bash
cp .env.example .env
```

3. `.env` dosyasını düzenleyin ve veritabanı bilgilerinizi girin.

4. Sunucuyu başlatın:
```bash
npm run dev  # Geliştirme modu (nodemon)
# veya
npm start    # Production modu
```

## 📦 Render.com Deploy

### Adımlar:

1. **GitHub'a Yükleme:**
   - Bu klasörü GitHub repository'sine yükleyin
   - Repository adı: `tekno-backend` (veya istediğiniz isim)

2. **Render.com'da Servis Oluşturma:**
   - [Render.com](https://render.com) adresine gidin
   - GitHub hesabınızla giriş yapın
   - "New > Web Service" seçin
   - GitHub repository'nizi bağlayın
   - Ayarlar:
     - **Name:** teknoproje-backend
     - **Environment:** Node
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** Free (veya istediğiniz plan)

3. **Environment Variables (Render.com Dashboard):**
   
   **Detaylı liste için:** `RENDER_COM_ENV_VARIABLES.md` dosyasına bakın
   
   **Temel değişkenler:**
   ```
   NODE_ENV=production
   PORT=10000
   DB_HOST=hpdemos.de (veya MySQL host adresiniz)
   DB_USER=veritabani_kullanici_adi
   DB_PASSWORD=veritabani_sifresi
   DB_NAME=veritabani_adi
   JWT_SECRET=çok_güçlü_bir_secret_key_32_karakter_minimum
   FRONTEND_URL=https://www.hpdemos.de
   BACKEND_URL=https://teknoproje-backend.onrender.com
   CORS_ORIGIN=https://www.hpdemos.de
   ```
   
   > **Not:** hpdemos.de MySQL bilgileriniz `backend/.env.hpdemos` dosyasında var.

4. **Deploy:**
   - Render otomatik olarak deploy edecek
   - URL: `https://teknoproje-backend.onrender.com` (veya belirlediğiniz isim)

## 🔗 API Endpoints

- Health Check: `GET /api/health`
- Authentication: `/api/auth/*`
- Projects: `/api/projects/*`
- Users: `/api/users/*`
- Admin: `/api/admin/*`
- Cart: `/api/cart/*`
- Orders: `/api/orders/*`
- ve daha fazlası...

## 📝 Notlar

- Render.com free plan'da uygulama 15 dakika kullanılmazsa uyku moduna geçer
- İlk istekte 30-60 saniye bekleme süresi olabilir
- Production için paid plan önerilir

## 🛠️ Teknolojiler

- Node.js
- Express.js
- MySQL2
- JWT Authentication
- Multer (File Upload)
- CORS

