# Figma Prototype Recorder

سكربت بيفتح رابط بروتوتايب Figma في متصفح، بيشغّله، وبيسجّله فيديو.

## التنصيب (مرة وحدة)

محتاج [Node.js](https://nodejs.org) مثبّت على الجهاز.

افتح PowerShell جوّا مجلد `protomotion-recorder` وشغّل:

```
npm install
npx playwright install chromium
```

## الاستخدام

```
node record.js -u "رابط_البروتوتايب"
```

الفيديو بينحفظ باسم `prototype.webm` في نفس المجلد.

## الخيارات

| الخيار | الوصف | الافتراضي |
|---|---|---|
| `-u, --url` | رابط بروتوتايب Figma (مطلوب) | — |
| `-o, --output` | مسار ملف الإخراج | `prototype.webm` |
| `-m, --maxdur` | أقصى مدة تسجيل بالثواني | `120` |
| `-i, --idle` | يوقف بعد هالثواني من عدم التغيّر | `5` |
| `-p, --pause` | ثواني بين كل ضغطة تلقائية | `2` |
| `-w, --width` | عرض الشاشة | `1536` |
| `-h, --height` | ارتفاع الشاشة | `864` |
| `-s, --scale` | معامل دقة الشاشة | `1` |
| `--manual` | إنت بتضغط بنفسك، السكربت بيسجّل بس | مطفي |
| `--headless` | تشغيل بدون متصفح ظاهر | مطفي |
| `--debug` | يطبع تغيّرات حجم/zoom الـ canvas | مطفي |
| `--nodetect` | يوقف الـ screenshots (بدون توقف تلقائي) | مطفي |
| `--fps` | عدد الفريمات بالثانية | `60` |
| `--bitrate` | جودة الفيديو بالميغابت/ثانية | `8` |

اضغط **Enter** بأي لحظة عشان توقف التسجيل وتحفظه.

## أمثلة

```
node record.js -u "https://figma.com/proto/..."
node record.js -u "https://figma.com/proto/..." --manual
node record.js -u "https://figma.com/proto/..." --nodetect
node record.js -u "https://figma.com/proto/..." --debug
node record.js -u "https://figma.com/proto/..." -p 3 -w 1440 -h 900
```

## نعومة الفيديو

Playwright بيسجّل افتراضياً بـ **25 فريم/ثانية** و **1 ميغابت/ثانية**، والرقمين مثبّتين
في كوده وما في خيار رسمي لتغييرهم. السكربت بيعدّلهم تلقائياً قبل ما يشغّل المتصفح
(افتراضياً 60fps و 8Mbps).

للحصول على أنعم نتيجة:

```
node record.js -u "الرابط" --nodetect --fps 60 --bitrate 12
```

`--nodetect` مهم للنعومة، لأن الـ screenshots اللي بيستخدمها الكشف التلقائي
بتجبر المتصفح يرسم من جديد وبتعمل تقطيع خفيف في التسجيل.

ملاحظة: إذا شغّلت `npm install` من جديد، بترجع إعدادات Playwright الأصلية —
بس السكربت بيعدّلها تلقائياً في كل تشغيل، فما بتحتاج تعمل إشي.

### تحويل لـ MP4 للمونتاج

```
ffmpeg -i prototype.webm -c:v libx264 -crf 16 -preset slow -pix_fmt yuv420p prototype.mp4
```

## تشخيص مشكلة الـ zoom blink

إذا الفيديو فيه تكبير/تصغير لحظي أثناء الانتقال بين الشاشات:

1. شغّل بـ `--nodetect`. إذا اختفت المشكلة → السبب كان الـ screenshots بتشوش على تسجيل الفيديو.
2. إذا ضلّت، شغّل بـ `--debug` وشوف شو بيتغيّر:
   - `buffer` أو `css` بيتغير → حجم عنصر الـ canvas بيتغير.
   - `transform` بيتغير → Figma بيغيّر الـ zoom.
   - ما في تغيّر → المشكلة جوّا WebGL، وبتنحل من إعدادات الانتقال في Figma.
3. جرّب تغيّر نوع الانتقال في Figma لـ **Instant** أو **Dissolve** بدل Move In / Slide In / Push.
