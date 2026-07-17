
-- Grant table access to authenticated and service_role for all app tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_entries TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weapons TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT ON public.page_visibility TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

GRANT ALL ON public.persons TO service_role;
GRANT ALL ON public.daily_reports TO service_role;
GRANT ALL ON public.report_entries TO service_role;
GRANT ALL ON public.services TO service_role;
GRANT ALL ON public.leaves TO service_role;
GRANT ALL ON public.leaders TO service_role;
GRANT ALL ON public.weapons TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.permissions TO service_role;
GRANT ALL ON public.page_visibility TO service_role;
GRANT ALL ON public.audit_log TO service_role;

-- Re-affirm EXECUTE on permission-check functions for authenticated & anon
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_pages() TO authenticated, service_role;

-- Ensure sequences (if any) are usable
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
