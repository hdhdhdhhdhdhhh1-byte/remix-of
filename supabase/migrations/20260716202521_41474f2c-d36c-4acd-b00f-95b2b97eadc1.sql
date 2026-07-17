
-- Enums
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'leader', 'viewer');
CREATE TYPE public.attendance_status AS ENUM ('present','absent','leave','sick','permit');
CREATE TYPE public.leave_status AS ENUM ('pending','approved','rejected');

-- Profiles (app users)
CREATE TABLE public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- User roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Permissions per module
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  UNIQUE(user_id, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Battery persons
CREATE TABLE public.persons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  military_rank text,
  squad text,
  phone text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.persons TO authenticated;
GRANT ALL ON public.persons TO service_role;
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- Daily reports
CREATE TABLE public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date date NOT NULL UNIQUE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

-- Report entries
CREATE TABLE public.report_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
  status public.attendance_status NOT NULL,
  note text,
  UNIQUE(report_id, person_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_entries TO authenticated;
GRANT ALL ON public.report_entries TO service_role;
ALTER TABLE public.report_entries ENABLE ROW LEVEL SECURITY;

-- Services
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id) ON DELETE CASCADE,
  service_type text NOT NULL,
  location text,
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Leaves
CREATE TABLE public.leaves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id) ON DELETE CASCADE,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status public.leave_status NOT NULL DEFAULT 'pending',
  reason text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaves TO authenticated;
GRANT ALL ON public.leaves TO service_role;
ALTER TABLE public.leaves ENABLE ROW LEVEL SECURITY;

-- Leaders
CREATE TABLE public.leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid REFERENCES public.persons(id) ON DELETE CASCADE,
  position text NOT NULL,
  unit text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaders TO authenticated;
GRANT ALL ON public.leaders TO service_role;
ALTER TABLE public.leaders ENABLE ROW LEVEL SECURITY;

-- Weapons
CREATE TABLE public.weapons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weapon_type text NOT NULL,
  serial_number text NOT NULL UNIQUE,
  assigned_to uuid REFERENCES public.persons(id) ON DELETE SET NULL,
  condition text NOT NULL DEFAULT 'good',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weapons TO authenticated;
GRANT ALL ON public.weapons TO service_role;
ALTER TABLE public.weapons ENABLE ROW LEVEL SECURITY;

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('owner','admin'));
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _module text, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id) OR EXISTS(
    SELECT 1 FROM public.permissions
    WHERE user_id = _user_id AND module = _module AND (
      (_action = 'view' AND can_view) OR
      (_action = 'edit' AND can_edit) OR
      (_action = 'approve' AND can_approve)
    )
  );
$$;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_persons_updated BEFORE UPDATE ON public.persons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_reports_updated BEFORE UPDATE ON public.daily_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS policies
-- profiles: user sees own; admins see all
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin insert profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()) OR user_id = auth.uid());

-- user_roles: user sees own; admin manages
CREATE POLICY "own roles read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- permissions: user sees own; admin manages
CREATE POLICY "own perms read" ON public.permissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "admin perms write" ON public.permissions FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- persons
CREATE POLICY "persons view" ON public.persons FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'persons','view') OR public.has_permission(auth.uid(),'reports','view'));
CREATE POLICY "persons edit" ON public.persons FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'persons','edit'));
CREATE POLICY "persons update" ON public.persons FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'persons','edit'));
CREATE POLICY "persons delete" ON public.persons FOR DELETE TO authenticated USING (public.has_permission(auth.uid(),'persons','edit'));

-- daily_reports
CREATE POLICY "reports view" ON public.daily_reports FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'reports','view'));
CREATE POLICY "reports insert" ON public.daily_reports FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'reports','edit'));
CREATE POLICY "reports update" ON public.daily_reports FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'reports','edit') OR public.has_permission(auth.uid(),'reports','approve'));
CREATE POLICY "reports delete" ON public.daily_reports FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- report_entries follow parent
CREATE POLICY "entries view" ON public.report_entries FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'reports','view'));
CREATE POLICY "entries write" ON public.report_entries FOR ALL TO authenticated USING (public.has_permission(auth.uid(),'reports','edit')) WITH CHECK (public.has_permission(auth.uid(),'reports','edit'));

-- services
CREATE POLICY "services view" ON public.services FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'services','view'));
CREATE POLICY "services write" ON public.services FOR ALL TO authenticated USING (public.has_permission(auth.uid(),'services','edit')) WITH CHECK (public.has_permission(auth.uid(),'services','edit'));

-- leaves
CREATE POLICY "leaves view" ON public.leaves FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'leaves','view'));
CREATE POLICY "leaves insert" ON public.leaves FOR INSERT TO authenticated WITH CHECK (public.has_permission(auth.uid(),'leaves','edit'));
CREATE POLICY "leaves update" ON public.leaves FOR UPDATE TO authenticated USING (public.has_permission(auth.uid(),'leaves','edit') OR public.has_permission(auth.uid(),'leaves','approve'));
CREATE POLICY "leaves delete" ON public.leaves FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- leaders
CREATE POLICY "leaders view" ON public.leaders FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'leaders','view'));
CREATE POLICY "leaders write" ON public.leaders FOR ALL TO authenticated USING (public.has_permission(auth.uid(),'leaders','edit')) WITH CHECK (public.has_permission(auth.uid(),'leaders','edit'));

-- weapons
CREATE POLICY "weapons view" ON public.weapons FOR SELECT TO authenticated USING (public.has_permission(auth.uid(),'weapons','view'));
CREATE POLICY "weapons write" ON public.weapons FOR ALL TO authenticated USING (public.has_permission(auth.uid(),'weapons','edit')) WITH CHECK (public.has_permission(auth.uid(),'weapons','edit'));
