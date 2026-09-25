# 📦 خروجی APK — هایپر صنعت اطلس

این پوشه محل **خروجی نهایی اپلیکیشن اندروید** است. فایل APK به‌صورت خودکار توسط
GitHub Actions ساخته و همین‌جا کامیت می‌شود؛ نیازی به کلون کردن پروژه روی کامپیوتر نیست.

---

## 📥 دانلود APK

### آخرین نسخه (همیشه به‌روز)

```
https://github.com/javanweb/ANDROIDATLAS/raw/main/apk/hyperatlas-latest.apk
```

### نسخهٔ مشخص

```
https://github.com/javanweb/ANDROIDATLAS/raw/main/apk/hyperatlas-v1.0.0.apk
```

### از صفحهٔ ریپازیتوری

`ANDROIDATLAS` → پوشهٔ **`apk/`** → روی فایل `.apk` کلیک کنید → دکمهٔ **Download**.

### از صفحهٔ Actions

`Actions` → workflow **Build APK** → آخرین run → بخش **Artifacts** → `hyperatlas-apk-v1.0.0`.

---

## 📁 ساختار فایل‌ها

| فایل | توضیح |
|---|---|
| `hyperatlas-latest.apk` | آخرین APK ساخته‌شده — لینک ثابت برای دانلود |
| `hyperatlas-v<نسخه>.apk` | APK همراه با شمارهٔ نسخه |
| `build-info.txt` | اطلاعات ساخت: نسخه، حجم، SHA-256، تاریخ، کامیت |
| `latest.json` | همان اطلاعات به‌formت JSON (برای اسکریپت یا فرانت) |

---

## 🔧 APK چطور ساخته می‌شود؟

پروژهٔ شما یک **وب‌اپلیکیشن React + Vite** است (نه React Native). برای گرفتن APK،
اپ با **Capacitor** داخل یک پوستهٔ Native اندروید بسته‌بندی می‌شود:

```
┌──────────────────────────────────────────────────────────────┐
│  src/            سورس React (TypeScript + Tailwind)           │
│      │                                                         │
│      ▼  scripts/optimize-images.mjs  (۲۶۶MB ➜ ۲۸MB WebP)       │
│      ▼  vite build                                                 │
│  dist/           وب‌اپلیکیشن آمادهٔ نصب                          │
│      │                                                         │
│      ▼  npx cap sync android                                     │
│  android/        پروژهٔ Native اندروید (Gradle)                  │
│      │                                                         │
│      ▼  ./gradlew assembleRelease                                │
│  apk/            ✅ APK نهایی، کامیت‌شده در ریپازیتوری           │
└──────────────────────────────────────────────────────────────┘
```

ورک‌فلوی مربوطه: [`.github/workflows/build-apk.yml`](../.github/workflows/build-apk.yml)

---

## 🚀 گرفتن APK جدید

**راه ۱ — خودکار:** هر تغییری در `src/`، `android/` یا `package.json` که Push شود،
ورک‌فلو اجرا می‌شود و APK جدید همین‌جا کامیت می‌شود.

**راه ۲ — دستی:**
1. بروید به تب **Actions**
2. ورک‌فلوی **Build APK** را انتخاب کنید
3. دکمهٔ **Run workflow** → در صورت نیاز `version_name` و `api_base_url` را پر کنید → **Run**

---

## ⚙️ تنظیمات مهم

### اتصال به سرور (لازم برای بخش هوش مصنوعی)

داخل APK، مسیرهای نسبی مثل `/api/ai/consult` به سرور شما وصل نمی‌شوند. آدرس سرور
واقعی را به‌صورت **Repository variable** تنظیم کنید:

> `Settings` → `Secrets and variables` → `Actions` → **Variables** → New repository variable

| نام | مقدار |
|---|---|
| `VITE_API_BASE_URL` | `https://atlassanat.ir` |

یا موقع اجرای دستی ورک‌فلو، در فیلد `api_base_url` وارد کنید.

### نسخهٔ اپ

| نام | مقدار | معنی |
|---|---|---|
| `APK_VERSION_NAME` | `1.0.1` | شمارهٔ نسخهٔ نمایشی |
| `APK_VERSION_CODE` | `2` | شمارهٔ داخلی (باید در هر انتشار افزایش یابد) |

اگر تنظیم نشوند، مقدار پیش‌فرض `1.0.0` و شمارهٔ run استفاده می‌شود.

### امضای APK برای انتشار در Google Play

APK فعلی با **debug key** امضا می‌شود؛ روی گوشی نصب می‌شود ولی برای Google Play
مناسب نیست. برای امضای رسمی، این چهار مورد را به‌صورت **Secret** اضافه کنید:

| Secret | مقدار |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | خروجی `base64 -w0 release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | رمز keystore |
| `ANDROID_KEY_ALIAS` | نام alias کلید |
| `ANDROID_KEY_PASSWORD` | رمز کلید |

> ⚠️ هرگز فایل keystore را داخل ریپازیتوری کامیت نکنید.

---

## ℹ️ مشخصات فنی

| | |
|---|---|
| شناسه اپ (package) | `ir.javanweb.hyperatlas` |
| نام نمایشی | هایپر صنعت اطلس |
| حداقل اندروید | 7.0 (API 24) |
| اندروید هدف | API 36 |
| موتور رابط کاربری | WebView (Capacitor) |
| حجم تقریبی | ~۳۵ MB |
