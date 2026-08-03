import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCheck, UserX, CalendarDays, Heart, Star, Shield, FileText, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const { fullName, user } = useAuth();
  const displayName = fullName || user?.email?.split("@")[0] || "بك";
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const key = `welcome_shown_${user.id}`;
    if (!sessionStorage.getItem(key)) {
      setWelcomeOpen(true);
      sessionStorage.setItem(key, "1");
    }
  }, [user]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats", today],
    queryFn: async () => {
      const [persons, leaders, weapons, todayReport] = await Promise.all([
        supabase.from("persons").select("id").eq("active", true),
        supabase.from("leaders").select("id"),
        supabase.from("weapons").select("id"),
        supabase.from("daily_reports").select("id, approved_at, notes").eq("report_date", today).maybeSingle(),
      ]);
      const totalPersons = persons.data?.length ?? 0;
      const leadersCount = leaders.data?.length ?? 0;
      const weaponsCount = weapons.data?.length ?? 0;

      let entries: { status: string }[] = [];
      if (todayReport.data) {
        const { data } = await supabase
          .from("report_entries")
          .select("status")
          .eq("report_id", todayReport.data.id);
        entries = data ?? [];
      }
      const count = (s: string) => entries.filter((e) => e.status === s).length;

      const present = todayReport.data ? count("present") : totalPersons;
      const absent = count("absent");
      const leave = count("leave");
      const sick = count("sick");
      const excuse = count("permit");
      const fullForce = totalPersons + leadersCount;
      const remaining = present + leadersCount;

      return {
        totalPersons,
        leadersCount,
        weaponsCount,
        present,
        absent,
        leave,
        sick,
        excuse,
        fullForce,
        remaining,
        hasReport: !!todayReport.data,
        approved: !!todayReport.data?.approved_at,
      };
    },
  });

  if (isLoading) return <div className="animate-pulse text-muted-foreground">جارٍ التحميل...</div>;
  if (!stats) return null;

  const cards = [
    { label: "القوة الكاملة", value: stats.fullForce, icon: Users, color: "bg-primary" },
    { label: "المتبقي (حاضر)", value: stats.remaining, icon: UserCheck, color: "bg-emerald-600" },
    { label: "غياب", value: stats.absent, icon: UserX, color: "bg-red-600" },
    { label: "إجازات", value: stats.leave, icon: CalendarDays, color: "bg-blue-600" },
    { label: "مرضى", value: stats.sick, icon: Heart, color: "bg-pink-600" },
    { label: "إذن", value: stats.excuse, icon: CalendarDays, color: "bg-amber-600" },
    { label: "القادة", value: stats.leadersCount, icon: Star, color: "bg-[color:var(--gold)] text-primary" },
    { label: "الأسلحة", value: stats.weaponsCount, icon: Shield, color: "bg-slate-700" },
  ];

  return (
    <div className="space-y-6">
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>أهلاً {displayName} 👋</DialogTitle>
            <DialogDescription>
              مرحباً بك في نظام إدارة البطارية. نتمنى لك يوماً موفقاً.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setWelcomeOpen(false)}>ابدأ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">أهلاً {displayName}</h1>
          <p className="text-muted-foreground text-sm mt-1">تقرير اليوم: {today}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/reports"><FileText className="h-4 w-4 ml-1" /> التقرير اليومي</Link>
          </Button>
          <Button asChild>
            <Link to="/services"><ClipboardList className="h-4 w-4 ml-1" /> خدمات اليوم</Link>
          </Button>
        </div>
      </div>

      {!stats.hasReport && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-6 text-sm">
            لم يتم إنشاء تقرير اليوم بعد. الأرقام أدناه تعرض القوة الكاملة كافتراض.
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label} className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <div className={`${c.color} rounded-lg p-2 text-white`}>
                <c.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
