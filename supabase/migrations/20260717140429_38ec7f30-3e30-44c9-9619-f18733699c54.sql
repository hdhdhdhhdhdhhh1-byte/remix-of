
ALTER TABLE public.daily_reports 
  ADD COLUMN IF NOT EXISTS edited_after_approval boolean NOT NULL DEFAULT false;

ALTER TABLE public.services 
  ADD COLUMN IF NOT EXISTS edited_after_approval boolean NOT NULL DEFAULT false;

ALTER TABLE public.permissions 
  ADD COLUMN IF NOT EXISTS can_cancel_approval boolean NOT NULL DEFAULT false;

-- Function to compute a person's current status from the latest approved daily report.
CREATE OR REPLACE FUNCTION public.person_current_status(_person_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT re.status::text
  FROM public.report_entries re
  JOIN public.daily_reports r ON r.id = re.report_id
  WHERE re.person_id = _person_id
    AND r.approved_at IS NOT NULL
  ORDER BY r.report_date DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.person_current_status(uuid) TO authenticated, anon, service_role;

-- Tighten view-only routes: SELECT for reports/services stays as-is (need to see own drafts to edit),
-- but expose a helper the app can call for the public "approved only" view page.
CREATE OR REPLACE FUNCTION public.latest_approved_report_date()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT report_date FROM public.daily_reports
  WHERE approved_at IS NOT NULL
  ORDER BY report_date DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.latest_approved_report_date() TO authenticated, anon, service_role;
