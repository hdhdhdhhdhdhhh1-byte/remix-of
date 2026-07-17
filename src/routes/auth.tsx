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
import logoAsset from "@/assets/resistance-logo.jpg.asset.json";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Ensure owner account exists on first launch (idempotent)
    ensureOwner().catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: redirect ?? "/dashboard", replace: true });
    }
  }, [session, loading, redirect, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error("فشل تسجيل الدخول: " + error.message);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user?.id) {
      await supabase.from("audit_log").insert({
        user_id: userData.user.id, action: "sign_in", entity: "auth", entity_id: userData.user.id,
      });
    }
    toast.success("تم تسجيل الدخول");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary via-primary/90 to-primary/70 px-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <img src={logoAsset.url} alt="شعار البطارية" className="mx-auto h-24 w-24 rounded-full object-cover shadow-lg" />
          <CardTitle className="text-2xl mt-4">نظام إدارة البطارية</CardTitle>
          <CardDescription>تسجيل الدخول للمتابعة</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="example@domain.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "جارٍ الدخول..." : "دخول"}
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
