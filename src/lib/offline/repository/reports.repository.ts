import { supabase } from "@/integrations/supabase/client";
import { getDB } from "../db";

const isOnline = () =>
  typeof navigator !== "undefined" && navigator.onLine;

export async function getReportByDate(reportDate: string) {
  const db = await getDB();

  // إذا يوجد إنترنت نحاول أخذ أحدث نسخة
  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from("daily_reports")
        .select("*, report_entries(*)")
        .eq("report_date", reportDate)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const { report_entries, ...report } = data;

        await db.put("reports", report);

        if (report_entries) {
          const tx = db.transaction("entries", "readwrite");

          for (const entry of report_entries) {
            await tx.store.put(entry);
          }

          await tx.done;
        }
      }

      return data;
    } catch (e) {
      console.warn("[OFFLINE] فشل جلب التقرير من الشبكة، استخدام المحلي");
    }
  }

  // بدون نت أو فشل الاتصال
  const localReport = await db
    .transaction("reports")
    .store.index("by_date")
    .get(reportDate);

  if (!localReport) return null;

  const entries = await db
    .transaction("entries")
    .store.getAll();

  return {
    ...localReport,
    report_entries: entries.filter(
      (e: any) => e.report_id === localReport.id
    ),
  };
}


export async function getLastApprovedReportBefore(
  reportDate: string
) {
  const db = await getDB();

  if (isOnline()) {
    try {
      const { data, error } = await supabase
        .from("daily_reports")
        .select(
          "id, report_date, approved_at, report_entries(person_id,status,note)"
        )
        .lt("report_date", reportDate)
        .not("approved_at", "is", null)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const { report_entries, ...report } = data;

        await db.put("reports", report);

        if (report_entries) {
          const tx = db.transaction("entries", "readwrite");

          for (const entry of report_entries) {
            await tx.store.put(entry);
          }

          await tx.done;
        }
      }

      return data;
    } catch {}
  }

  const reports = await db.getAll("reports");

  return (
    reports
      .filter(
        (r: any) =>
          r.approved_at &&
          r.report_date < reportDate
      )
      .sort(
        (a: any, b: any) =>
          b.report_date.localeCompare(a.report_date)
      )[0] ?? null
  );
}


export async function saveOfflineReport(report: any, entries: any[]) {
  const db = await getDB();

  await db.put("reports", report);

  const tx = db.transaction("entries", "readwrite");
  for (const entry of entries) {
    await tx.store.put(entry);
  }
  await tx.done;

  await db.add("queue", {
    type: "upsert_report",
    payload: report,
    created_at: new Date().toISOString(),
  });

  await db.add("queue", {
    type: "upsert_entries",
    payload: entries,
    created_at: new Date().toISOString(),
  });
}
