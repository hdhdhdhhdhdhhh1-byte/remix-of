
DROP FUNCTION IF EXISTS public.my_permissions();

CREATE OR REPLACE FUNCTION public.my_permissions()
 RETURNS TABLE(module text, can_view boolean, can_edit boolean, can_approve boolean, can_add boolean, can_delete boolean, can_print boolean, can_export_pdf boolean, can_export_image boolean, can_cancel_approval boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT module, can_view, can_edit, can_approve,
         can_add, can_delete, can_print, can_export_pdf, can_export_image, can_cancel_approval
  FROM public.permissions WHERE user_id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT public.is_admin(_user_id) OR EXISTS(
    SELECT 1 FROM public.permissions
    WHERE user_id = _user_id AND module = _module AND (
      (_action = 'view' AND can_view) OR
      (_action = 'edit' AND can_edit) OR
      (_action = 'approve' AND can_approve) OR
      (_action = 'add' AND can_add) OR
      (_action = 'delete' AND can_delete) OR
      (_action = 'print' AND can_print) OR
      (_action = 'export_pdf' AND can_export_pdf) OR
      (_action = 'export_image' AND can_export_image) OR
      (_action = 'cancel_approval' AND can_cancel_approval)
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.enforce_approved_report_lock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.approved_at IS NOT NULL AND NEW.approved_at IS NULL THEN
      IF NOT public.has_permission(v_uid, 'reports', 'cancel_approval') THEN
        RAISE EXCEPTION 'ليس لديك صلاحية إلغاء اعتماد التقرير';
      END IF;
      RETURN NEW;
    END IF;
    IF OLD.approved_at IS NOT NULL THEN
      RAISE EXCEPTION 'لا يمكن تعديل تقرير معتمد. قم بإلغاء الاعتماد أولاً';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.approved_at IS NOT NULL AND NOT public.has_permission(v_uid, 'reports', 'cancel_approval') THEN
      RAISE EXCEPTION 'لا يمكن حذف تقرير معتمد';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_daily_reports_approved_lock ON public.daily_reports;
CREATE TRIGGER trg_daily_reports_approved_lock
BEFORE UPDATE OR DELETE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_report_lock();

CREATE OR REPLACE FUNCTION public.enforce_approved_entries_lock()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_approved timestamptz;
  v_report_id uuid := COALESCE(NEW.report_id, OLD.report_id);
BEGIN
  IF auth.uid() IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  SELECT approved_at INTO v_approved FROM public.daily_reports WHERE id = v_report_id;
  IF v_approved IS NOT NULL THEN
    RAISE EXCEPTION 'لا يمكن تعديل بنود تقرير معتمد';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_report_entries_approved_lock ON public.report_entries;
CREATE TRIGGER trg_report_entries_approved_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.report_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_approved_entries_lock();
