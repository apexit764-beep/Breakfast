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
| `-z, --zoom` | معامل التكبير في الفيديو (`2` يعني 2x، `3` يعني 3x) | `1` |
| `-f, --focus` | نقطة التكبير: `center`، `top`، `bottom`، `left`، `right`، `top-left`، `top-right`، `bottom-left`، `bottom-right` — أو قيمة CSS مثل `"50% 30%"` | `center` |
| `--manual` | إنت بتضغط بنفسك، السكربت بيسجّل بس | مطفي |
| `--headless` | تشغيل بدون متصفح ظاهر | مطفي |
| `--debug` | يطبع تغيّرات حجم/zoom الـ canvas | مطفي |
| `--nodetect` | يوقف الـ screenshots (بدون توقف تلقائي) | مطفي |

اضغط **Enter** بأي لحظة عشان توقف التسجيل وتحفظه.

## أمثلة

```
node record.js -u "https://figma.com/proto/..."
node record.js -u "https://figma.com/proto/..." --manual
node record.js -u "https://figma.com/proto/..." --nodetect
node record.js -u "https://figma.com/proto/..." --debug
node record.js -u "https://figma.com/proto/..." -p 3 -w 1440 -h 900
node record.js -u "https://figma.com/proto/..." -z 2
node record.js -u "https://figma.com/proto/..." -z 3 -f top
```

## التكبير (Zoom)

`-z` بيكبّر المشهد جوّا الفيديو، يعني بيقصّ الأطراف وبيعرض الجزء المحدد بحجم أكبر:

```
node record.js -u "https://figma.com/proto/..." -z 2
```

- التكبير بيصير حوالين **وسط الشاشة** افتراضياً. لو بدك تكبّر على منطقة تانية استعمل `-f`:

```
node record.js -u "https://figma.com/proto/..." -z 2 -f top-left
node record.js -u "https://figma.com/proto/..." -z 2.5 -f "50% 25%"
```

- الفيديو بيضل **واضح مش مبكسل**: السكربت بيرفع دقّة الرسم (device scale factor) بنفس معامل التكبير، فـ Figma بيرسم البروتوتايب بدقة أعلى بدل ما ينعمل تكبير لصورة جاهزة.
- أقصى دقّة رسم `4x` (يعني `scale × zoom`). لو تجاوزتها بيكمّل التسجيل بـ `4x` وبيطبع تنبيه — التكبير بيضل شغّال بس الوضوح بيقل شوي.
- التكبير بيزيد استهلاك الذاكرة والمعالج، فلو التسجيل صار متقطّع جرّب `-w`/`-h` أصغر أو `-z` أقل.
- في الوضع التلقائي، السكربت بيضبط مكان الضغطة على وسط البروتوتايب نفسه (مش وسط الشاشة) عشان التكبير ما يخربط الضغطات.
- أرقام عشرية مسموحة (`-z 1.5`)، والحد الأدنى `1` (بدون تكبير).

## تشخيص مشكلة الـ zoom blink

إذا الفيديو فيه تكبير/تصغير لحظي أثناء الانتقال بين الشاشات:

1. شغّل بـ `--nodetect`. إذا اختفت المشكلة → السبب كان الـ screenshots بتشوش على تسجيل الفيديو.
2. إذا ضلّت، شغّل بـ `--debug` وشوف شو بيتغيّر:
   - `buffer` أو `css` بيتغير → حجم عنصر الـ canvas بيتغير.
   - `transform` بيتغير → Figma بيغيّر الـ zoom.
   - ما في تغيّر → المشكلة جوّا WebGL، وبتنحل من إعدادات الانتقال في Figma.
3. جرّب تغيّر نوع الانتقال في Figma لـ **Instant** أو **Dissolve** بدل Move In / Slide In / Push.
