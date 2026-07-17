## الهدف
فصل التطبيق عن Lovable Cloud وربطه بمشروع Supabase الخارجي الخاص بك، ليعمل بشكل صحيح على Netlify (بما في ذلك إضافة المستخدمين).

## المتطلبات منك قبل التنفيذ
1. **مفاتيح مشروع Supabase الخارجي** (من Project Settings → API):
   - `VITE_SUPABASE_URL` (مثال: `https://bkwwtkfejvyqjzaririv.supabase.co`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (anon/publishable key)
2. **ملف SQL للمخطط**: سأولّد لك ملف SQL شامل يحتوي على كل الجداول (12 جدول)، الدوال (11 دالة)، السياسات (RLS)، والصلاحيات (GRANT) الموجودة حالياً في Lovable Cloud لتشغيله في SQL Editor بمشروعك الخارجي.
3. **متغيرات البيئة في Netlify**: تُضاف من Site Settings → Environment variables.

## الخطوات

### 1) توليد ملف SQL للنقل
- إنشاء `supabase/external-schema.sql` يحتوي على:
  - إنشاء نوع `app_role`
  - إنشاء جميع الجداول العامة (12 جدول) مع الأعمدة والافتراضات
  - GRANT statements لكل جدول
  - تفعيل RLS + جميع السياسات
  - جميع الدوال (`has_role`, `is_admin`, `my_role`, `my_permissions`, `my_pages`, `handle_new_user`, `set_updated_at`, `enforce_approved_report_lock`, `enforce_approved_entries_lock`, `latest_approved_report_date`, `person_current_status`, `has_permission`)
  - الترجرات (triggers) للجداول
  - Trigger `on_auth_user_created` على `auth.users` لإنشاء profile تلقائياً
- تعليمات تشغيله في SQL Editor بمشروعك الجديد.

### 2) تحديث `.env` بمفاتيح المشروع الخارجي
استبدال محتوى `.env` بالكامل بمفاتيح `bkwwtkfejvyqjzaririv` التي ستزودني بها.

### 3) تحديث `src/integrations/supabase/client.ts`
الملف حالياً يقرأ من `import.meta.env.VITE_SUPABASE_*` — يعمل تلقائياً بعد تحديث `.env`، لكن نظراً لأنه ملف auto-generated سنقوم بجعله ثابتاً (يقرأ فقط من env بدون fallback على process.env) لضمان عدم إعادة توليده لاحقاً.

### 4) تعليمات نشر Netlify
سأزودك بقائمة متغيرات البيئة المطلوب إضافتها في Netlify:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

### 5) إعداد Auth في المشروع الخارجي (يدوياً منك)
- تفعيل Email provider في Authentication → Providers
- إضافة رابط Netlify في Authentication → URL Configuration → Site URL & Redirect URLs
- (اختياري) إذا تستخدم Google OAuth، تفعيله من نفس القائمة

## تنبيهات مهمة
- **البيانات الموجودة حالياً في Lovable Cloud لن تُنقل تلقائياً**. إذا أردت نقلها استخدم Cloud → Advanced → Export data ثم استيرادها يدوياً في المشروع الخارجي.
- بعد الفصل، المعاينة داخل Lovable قد تظل تستخدم Lovable Cloud (لأن `.env` في Lovable قد يُعاد توليده)، لكن Netlify سيستخدم المفاتيح الخارجية.
- لن تعود قادراً على استخدام أدوات Lovable Cloud (migrations, secrets, edge functions) للتحكم بالمشروع الخارجي — كل التغييرات ستكون يدوية عبر Supabase Dashboard.

## المطلوب منك للمتابعة
أرسل لي:
1. `VITE_SUPABASE_URL` الخاص بمشروع `bkwwtkfejvyqjzaririv`
2. `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key)

بمجرد استلامها سأنفذ الخطوات 1-4.
