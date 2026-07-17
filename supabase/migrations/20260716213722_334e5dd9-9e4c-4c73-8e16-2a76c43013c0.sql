
-- =============================================
-- Battery Management System v2.0 — Restructuring
-- =============================================

-- 1. Extend app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platoon_leader';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'office';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'battery_commander';

-- 2. Extend attendance_status enum
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'mission';
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'course';
ALTER TYPE public.attendance_status ADD VALUE IF NOT EXISTS 'other';
