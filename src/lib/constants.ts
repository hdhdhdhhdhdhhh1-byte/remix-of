export const FORMATIONS = ["الضباط", "ف١", "ف٢", "ق س", "ق ك"] as const;
export type Formation = typeof FORMATIONS[number];

export const SERVICE_LOCATIONS = ["التبة", "البوابة", "مترس ١", "مترس ٢"] as const;
export type ServiceLocation = typeof SERVICE_LOCATIONS[number];

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "leave",
  "sick",
  "permit",
  "mission",
  "course",
  "other",
] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  leave: "إجازة",
  sick: "مريض",
  permit: "إذن",
  mission: "مأمورية",
  course: "دورة",
  other: "أخرى",
};

export const ABSENT_STATUSES: AttendanceStatus[] = [
  "absent",
  "leave",
  "sick",
  "permit",
  "mission",
  "course",
  "other",
];

export const APP_MODULES = [
  { key: "dashboard", label: "لوحة التحكم" },
  { key: "persons", label: "الأفراد" },
  { key: "reports_entry", label: "التقرير اليومي — رفع" },
  { key: "reports_view", label: "التقرير اليومي — عرض" },
  { key: "services_entry", label: "الخدمات — رفع" },
  { key: "services_view", label: "الخدمات — عرض" },
  { key: "leaves", label: "الإجازات" },
  { key: "leaders", label: "القادة" },
  { key: "weapons", label: "الأسلحة" },
  { key: "archive", label: "الأرشيف" },
  { key: "users", label: "إدارة المستخدمين" },
  { key: "audit", label: "سجل العمليات" },
  { key: "backup", label: "النسخ الاحتياطي" },
] as const;

export type ModuleKey = typeof APP_MODULES[number]["key"];

export const APP_ROLES = [
  { key: "owner", label: "المالك" },
  { key: "battery_commander", label: "قائد البطارية" },
  { key: "office", label: "المكتب" },
  { key: "platoon_leader", label: "قائد فصيل" },
  { key: "admin", label: "مدير" },
  { key: "leader", label: "قائد" },
  { key: "viewer", label: "مشاهد" },
] as const;
