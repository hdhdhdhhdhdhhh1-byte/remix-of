import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { ensureOwner } from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import logoUrl from "@/assets/resistance-logo.jpg";
import { WifiOff } from "lucide-react";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

async function hashPassword(pw: string): Promise<string> {
  const enc = new TextEncoder().encode(pw);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const [isOffline] = useState(!navigator.onLine);

  useEffect(() => {
    ensureOwner().catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: redirect?? "/dashboard", replace: true });
    }
  }, [session, loading, redirect, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);

    const offlineUserStr = localStorage.getItem('offline_user');
    const offlineSessionStr = localStorage.getItem('offline_session');

    // محاولة دخول بدون نت
    if (!navigator.onLine) {
      try {
        if (!offlineUserStr ||!offlineSessionStr) throw new Error('لا يوجد حساب محفوظ. ادخل مرة واحدة بالنت أولاً.');
        const offlineUser = JSON.parse(offlineUserStr);
        if (offlineUser.email!== email) throw new Error('هذا البريد غير محفوظ للعمل بدون نت. ادخل بالنت أولاً بهذا البريد.');
        const savedHash = localStorage.getItem(`offline_cred_${email}`);
        if (!savedHash) throw new Error('كلمة المرور غير محفوظة. ادخل مرة واحدة بالنت أولاً.');
        const inputHash = await hashPassword(password);
        if (inputHash!== savedHash) throw new Error('كلمة المرور غير صحيحة (بدون نت)');
        // نجح - استخدم الجلسة المحفوظة
        toast.success("تم الدخول بدون نت 📴");
        navigate({ to: redirect?? "/dashboard", replace: true });
        setBusy(false);
        return;
      } catch (err: any) {
        toast.error(err.message);
        setShake(true);
        setTimeout(() => setShake(false), 450);
        setBusy(false);
        return;
      }
    }

    // دخول طبيعي بالنت
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // احفظ hash للعمل بدون نت مستقبلاً
      const h = await hashPassword(password);
      localStorage.setItem(`offline_cred_${email}`, h);

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user?.id) {
        await supabase.from("audit_log").insert({
          user_id: userData.user.id, action: "sign_in", entity: "auth", entity_id: userData.user.id,
        });
      }
      toast.success("تم تسجيل الدخول");
    } catch (err: any) {
      // إذا فشل بسبب النت لكن عندنا كاش، جرب الدخول المحلي
      if (err.message?.includes('Failed to fetch') || err.message?.includes('Network')) {
        const savedHash = localStorage.getItem(`offline_cred_${email}`);
        if (savedHash) {
          const inputHash = await hashPassword(password);
          if (inputHash === savedHash && offlineSessionStr) {
            toast.success("النت ضعيف - تم الدخول محلياً وسيتم المزامنة لاحقاً");
            navigate({ to: redirect?? "/dashboard", replace: true });
            setBusy(false);
            return;
          }
        }
      }
      toast.error("فشل تسجيل الدخول: " + err.message);
      setShake(true);
      setTimeout(() => setShake(false), 450);
    }
    setBusy(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-4">
      <Card className={`w-full max-w-md shadow-2xl animate-login-enter ${shake? "animate-login-shake" : ""}`}>
        <CardHeader className="text-center">
          <img src={logoUrl} alt="شعار البطارية" className="mx-auto h-24 w-24 rounded-full object-cover shadow-lg" />
          <CardTitle className="text-2xl mt-4">نظام إدارة البطارية</CardTitle>
          <CardDescription className="flex items-center justify-center gap-2">
            تسجيل الدخول للمتابعة
            {isOffline && <span className="text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1"><WifiOff className="h-3 w-3"/> وضع عدم الاتصال</span>}
          </CardDescription>
          {isOffline && <p className="text-[12px] text-amber-700 mt-2 bg-amber-50 p-2 rounded">أنت بدون نت - يمكنك الدخول إذا سبق ودخلت بهذا الجهاز من قبل</p>}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="example@domain.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full transition-transform hover:scale-[1.02]" disabled={busy}>
              {busy? "جارٍ الدخول..." : isOffline? "دخول بدون نت" : "دخول"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground text-center">
            لا توجد صفحة تسجيل عامة. حسابات المستخدمين يُنشئها المالك فقط.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
