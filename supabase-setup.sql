-- Blog backend setup for Supabase.
-- This file is intentionally idempotent and can be re-run in SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles and roles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  github_username TEXT UNIQUE,
  github_avatar_url TEXT,
  website TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  account_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status TEXT;
UPDATE public.profiles SET account_status = 'active' WHERE account_status IS NULL;
ALTER TABLE public.profiles ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE public.profiles ALTER COLUMN account_status SET NOT NULL;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'author', 'admin', 'superadmin'));
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'suspended', 'deleted'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_any_role(required_roles TEXT[])
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND account_status = 'active'
      AND role = ANY(required_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  SELECT public.has_any_role(ARRAY['author', 'superadmin']);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  SELECT public.has_any_role(ARRAY['superadmin']);
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  SELECT public.has_any_role(ARRAY['superadmin']);
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, github_username, github_avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'user_name',
      SPLIT_PART(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'user_name',
    CASE WHEN NEW.raw_user_meta_data->>'user_name' IS NOT NULL
         THEN NEW.raw_user_meta_data->>'avatar_url' ELSE NULL END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- A browser session may update profile fields, but never role or account status.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() = OLD.id AND NOT public.is_superadmin() THEN
    NEW.role = OLD.role;
    NEW.account_status = OLD.account_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_fields ON public.profiles;
CREATE TRIGGER profiles_protect_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_fields();

-- The RPC is the only client-visible way to read the caller's role/status.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id UUID,
  username TEXT,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  github_username TEXT,
  github_avatar_url TEXT,
  website TEXT,
  role TEXT,
  account_status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  SELECT p.id, p.username, p.display_name, p.bio, p.avatar_url,
         p.github_username, p.github_avatar_url, p.website, p.role,
         p.account_status, p.created_at, p.updated_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.try_claim_primary_superadmin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  primary_profile_id UUID := auth.uid();
  github_login TEXT;
BEGIN
  IF primary_profile_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT lower(COALESCE(
    i.identity_data->>'user_name',
    i.identity_data->>'login',
    i.identity_data->>'preferred_username'
  ))
  INTO github_login
  FROM auth.identities i
  WHERE i.user_id = primary_profile_id
    AND i.provider = 'github'
  ORDER BY i.created_at
  LIMIT 1;

  IF github_login IS DISTINCT FROM 'levia808' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
  SET role = 'user'
  WHERE id <> primary_profile_id
    AND role IN ('admin', 'superadmin');

  UPDATE public.profiles
  SET role = 'superadmin',
      account_status = 'active'
  WHERE id = primary_profile_id;

  RETURN FOUND;
END;
$$;

-- ---------------------------------------------------------------------------
-- Content metadata and versions. The markdown source remains in Hugo/Sveltia.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.content_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_path TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_reason TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_item_id UUID NOT NULL REFERENCES public.content_items(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  source_markdown TEXT NOT NULL,
  checksum TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (content_item_id, version_number)
);

ALTER TABLE public.content_items DROP CONSTRAINT IF EXISTS content_items_status_check;
ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_status_check
  CHECK (status IN ('draft', 'pending_review', 'published', 'archived', 'rejected'));

CREATE INDEX IF NOT EXISTS content_items_status_idx
  ON public.content_items (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS content_versions_item_created_idx
  ON public.content_versions (content_item_id, created_at DESC);

DROP TRIGGER IF EXISTS content_items_set_updated_at ON public.content_items;
CREATE TRIGGER content_items_set_updated_at
  BEFORE UPDATE ON public.content_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Comments, reports and moderation
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.comments (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  post_path TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'approved',
  moderation_reason TEXT,
  moderated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS moderation_status TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS moderation_reason TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
UPDATE public.comments SET moderation_status = 'approved' WHERE moderation_status IS NULL;
ALTER TABLE public.comments ALTER COLUMN moderation_status SET DEFAULT 'approved';
ALTER TABLE public.comments ALTER COLUMN moderation_status SET NOT NULL;
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_content_check;
ALTER TABLE public.comments DROP CONSTRAINT IF EXISTS comments_moderation_status_check;
ALTER TABLE public.comments
  ADD CONSTRAINT comments_content_check
  CHECK (char_length(trim(content)) BETWEEN 1 AND 2000);
ALTER TABLE public.comments
  ADD CONSTRAINT comments_moderation_status_check
  CHECK (moderation_status IN ('pending', 'approved', 'rejected', 'hidden'));

CREATE INDEX IF NOT EXISTS comments_post_path_created_at_idx
  ON public.comments (post_path, created_at);
CREATE INDEX IF NOT EXISTS comments_moderation_status_idx
  ON public.comments (moderation_status, created_at DESC);

DROP TRIGGER IF EXISTS comments_set_updated_at ON public.comments;
CREATE TRIGGER comments_set_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_comment_submission()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  recent_count INTEGER;
  daily_count INTEGER;
BEGIN
  IF auth.uid() IS NULL OR NEW.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You must be signed in to comment' USING ERRCODE = '42501';
  END IF;

  NEW.content = trim(NEW.content);
  IF char_length(NEW.content) < 1 OR char_length(NEW.content) > 2000 THEN
    RAISE EXCEPTION 'Comment length must be between 1 and 2000 characters' USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO recent_count
  FROM public.comments
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '30 seconds';
  IF recent_count > 0 THEN
    RAISE EXCEPTION 'Please wait before posting another comment' USING ERRCODE = 'P0001';
  END IF;

  SELECT COUNT(*) INTO daily_count
  FROM public.comments
  WHERE user_id = NEW.user_id
    AND created_at > NOW() - INTERVAL '1 day';
  IF daily_count >= 50 THEN
    RAISE EXCEPTION 'Daily comment limit reached' USING ERRCODE = 'P0001';
  END IF;

  NEW.moderation_status = 'approved';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_validate_submission ON public.comments;
CREATE TRIGGER comments_validate_submission
  BEFORE INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_comment_submission();

CREATE TABLE IF NOT EXISTS public.comment_reports (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, reporter_id)
);

ALTER TABLE public.comment_reports DROP CONSTRAINT IF EXISTS comment_reports_status_check;
ALTER TABLE public.comment_reports
  ADD CONSTRAINT comment_reports_status_check
  CHECK (status IN ('open', 'dismissed', 'actioned'));

CREATE INDEX IF NOT EXISTS comment_reports_status_created_idx
  ON public.comment_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('comment', 'content')),
  comment_id BIGINT REFERENCES public.comments(id) ON DELETE CASCADE,
  content_item_id UUID REFERENCES public.content_items(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 50,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (entity_type = 'comment' AND comment_id IS NOT NULL AND content_item_id IS NULL)
    OR (entity_type = 'content' AND content_item_id IS NOT NULL AND comment_id IS NULL)
  )
);

ALTER TABLE public.moderation_queue DROP CONSTRAINT IF EXISTS moderation_queue_status_check;
ALTER TABLE public.moderation_queue
  ADD CONSTRAINT moderation_queue_status_check
  CHECK (status IN ('pending', 'in_review', 'resolved', 'rejected'));

CREATE UNIQUE INDEX IF NOT EXISTS moderation_queue_comment_open_idx
  ON public.moderation_queue (comment_id)
  WHERE entity_type = 'comment' AND status IN ('pending', 'in_review');

CREATE UNIQUE INDEX IF NOT EXISTS moderation_queue_content_open_idx
  ON public.moderation_queue (content_item_id)
  WHERE entity_type = 'content' AND status IN ('pending', 'in_review');

DROP TRIGGER IF EXISTS moderation_queue_set_updated_at ON public.moderation_queue;
CREATE TRIGGER moderation_queue_set_updated_at
  BEFORE UPDATE ON public.moderation_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.queue_comment_report()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  report_count INTEGER;
BEGIN
  INSERT INTO public.moderation_queue (entity_type, comment_id, reason, priority)
  VALUES ('comment', NEW.comment_id, NEW.reason, 80)
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*) INTO report_count
  FROM public.comment_reports
  WHERE comment_id = NEW.comment_id AND status = 'open';

  IF report_count >= 3 THEN
    UPDATE public.comments
    SET moderation_status = 'pending',
        moderation_reason = 'Multiple user reports'
    WHERE id = NEW.comment_id
      AND moderation_status = 'approved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comment_reports_queue_moderation ON public.comment_reports;
CREATE TRIGGER comment_reports_queue_moderation
  AFTER INSERT ON public.comment_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_comment_report();

-- ---------------------------------------------------------------------------
-- Notifications, audit and security events
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_created_idx
  ON public.notifications (recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_idx
  ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
  ON public.audit_logs (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.security_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.security_events DROP CONSTRAINT IF EXISTS security_events_severity_check;
ALTER TABLE public.security_events
  ADD CONSTRAINT security_events_severity_check
  CHECK (severity IN ('info', 'warning', 'critical'));

CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_action TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_metadata, '{}'::jsonb));
$$;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  INSERT INTO public.notifications (recipient_id, notification_type, title, body, metadata)
  VALUES (p_recipient_id, p_type, p_title, p_body, COALESCE(p_metadata, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- User-facing RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.report_comment(p_comment_id BIGINT, p_reason TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  comment_owner UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to report a comment' USING ERRCODE = '42501';
  END IF;
  SELECT user_id INTO comment_owner FROM public.comments WHERE id = p_comment_id;
  IF comment_owner IS NULL THEN
    RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'P0002';
  END IF;
  IF comment_owner = auth.uid() THEN
    RAISE EXCEPTION 'You cannot report your own comment' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.comment_reports (comment_id, reporter_id, reason)
  VALUES (p_comment_id, auth.uid(), trim(p_reason))
  ON CONFLICT (comment_id, reporter_id) DO NOTHING;
  PERFORM public.write_audit_log('comment.report', 'comment', p_comment_id::TEXT,
    jsonb_build_object('reason', trim(p_reason)));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE sql
AS $$
  UPDATE public.notifications
  SET read_at = COALESCE(read_at, NOW())
  WHERE id = p_notification_id AND recipient_id = auth.uid()
  RETURNING TRUE;
$$;

-- ---------------------------------------------------------------------------
-- Admin and moderation RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'total_users', (SELECT COUNT(*) FROM public.profiles),
    'active_users', (SELECT COUNT(*) FROM public.profiles WHERE account_status = 'active'),
    'total_comments', (SELECT COUNT(*) FROM public.comments),
    'pending_comments', (SELECT COUNT(*) FROM public.comments WHERE moderation_status = 'pending'),
    'open_reports', (SELECT COUNT(*) FROM public.comment_reports WHERE status = 'open'),
    'published_content', (SELECT COUNT(*) FROM public.content_items WHERE status = 'published'),
    'pending_content', (SELECT COUNT(*) FROM public.content_items WHERE status = 'pending_review')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  github_username TEXT,
  role TEXT,
  account_status TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
)
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT p.id, u.email::TEXT, p.username, p.display_name, p.avatar_url,
         p.github_username, p.role, p.account_status, p.created_at, u.last_sign_in_at
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_comments(p_status TEXT DEFAULT NULL)
RETURNS TABLE (
  id BIGINT,
  post_path TEXT,
  content TEXT,
  moderation_status TEXT,
  moderation_reason TEXT,
  created_at TIMESTAMPTZ,
  user_id UUID,
  display_name TEXT,
  username TEXT
)
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.post_path, c.content, c.moderation_status, c.moderation_reason,
         c.created_at, c.user_id, p.display_name, p.username
  FROM public.comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE p_status IS NULL OR c.moderation_status = p_status
  ORDER BY c.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_reports(p_status TEXT DEFAULT 'open')
RETURNS TABLE (
  id BIGINT,
  comment_id BIGINT,
  reason TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  reporter_id UUID,
  reporter_name TEXT,
  comment_content TEXT,
  comment_path TEXT
)
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.comment_id, r.reason, r.status, r.created_at, r.reporter_id,
         COALESCE(rp.display_name, rp.username), c.content, c.post_path
  FROM public.comment_reports r
  JOIN public.comments c ON c.id = r.comment_id
  LEFT JOIN public.profiles rp ON rp.id = r.reporter_id
  WHERE p_status IS NULL OR r.status = p_status
  ORDER BY r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_comment(
  p_comment_id BIGINT,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.comments
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  updated_comment public.comments;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('pending', 'approved', 'rejected', 'hidden') THEN
    RAISE EXCEPTION 'Invalid moderation status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.comments
  SET moderation_status = p_status,
      moderation_reason = NULLIF(trim(p_reason), ''),
      moderated_by = auth.uid(),
      moderated_at = NOW(),
      deleted_at = CASE WHEN p_status = 'hidden' THEN COALESCE(deleted_at, NOW()) ELSE NULL END
  WHERE id = p_comment_id
  RETURNING * INTO updated_comment;
  IF updated_comment.id IS NULL THEN
    RAISE EXCEPTION 'Comment not found' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.moderation_queue
  SET status = CASE WHEN p_status IN ('approved', 'rejected', 'hidden') THEN 'resolved' ELSE 'in_review' END,
      updated_at = NOW()
  WHERE comment_id = p_comment_id AND status IN ('pending', 'in_review');
  UPDATE public.comment_reports
  SET status = CASE WHEN p_status IN ('rejected', 'hidden') THEN 'actioned' ELSE 'dismissed' END,
      resolved_by = auth.uid(),
      resolved_at = NOW()
  WHERE comment_id = p_comment_id AND status = 'open';
  IF updated_comment.user_id <> auth.uid() THEN
    PERFORM public.create_notification(
      updated_comment.user_id,
      'comment.moderated',
      'Comment moderation result',
      CASE p_status
        WHEN 'approved' THEN 'Your comment was approved.'
        WHEN 'rejected' THEN 'Your comment was rejected.'
        WHEN 'hidden' THEN 'Your comment was hidden.'
        ELSE 'Your comment status was updated.'
      END,
      jsonb_build_object('comment_id', p_comment_id, 'status', p_status)
    );
  END IF;
  PERFORM public.write_audit_log(
    'comment.moderate',
    'comment',
    p_comment_id::TEXT,
    jsonb_build_object('status', p_status, 'reason', p_reason)
  );
  RETURN updated_comment;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_account_status(
  p_user_id UUID,
  p_status TEXT
)
RETURNS public.profiles
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  updated_profile public.profiles;
  target_role TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('active', 'suspended', 'deleted') THEN
    RAISE EXCEPTION 'Invalid account status' USING ERRCODE = '22023';
  END IF;
  SELECT role INTO target_role FROM public.profiles WHERE id = p_user_id;
  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  IF target_role = 'superadmin' AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only a superadmin can change a superadmin account' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
  SET account_status = p_status
  WHERE id = p_user_id
  RETURNING * INTO updated_profile;
  PERFORM public.write_audit_log(
    'user.status.update',
    'profile',
    p_user_id::TEXT,
    jsonb_build_object('status', p_status)
  );
  RETURN updated_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_update_role(
  p_user_id UUID,
  p_role TEXT
)
RETURNS public.profiles
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  updated_profile public.profiles;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin access required' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('user', 'author', 'admin', 'superadmin') THEN
    RAISE EXCEPTION 'Invalid role' USING ERRCODE = '22023';
  END IF;
  UPDATE public.profiles SET role = p_role WHERE id = p_user_id RETURNING * INTO updated_profile;
  IF updated_profile.id IS NULL THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log(
    'user.role.update',
    'profile',
    p_user_id::TEXT,
    jsonb_build_object('role', p_role)
  );
  RETURN updated_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_content(p_status TEXT DEFAULT NULL)
RETURNS SETOF public.content_items
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.*
  FROM public.content_items c
  WHERE p_status IS NULL OR c.status = p_status
  ORDER BY c.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_content_item(
  p_post_path TEXT,
  p_title TEXT,
  p_author_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT 'draft',
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.content_items
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  item public.content_items;
  owner_id UUID := COALESCE(p_author_id, auth.uid());
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Author access required' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_admin() AND owner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Authors may only manage their own content' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.content_items (post_path, title, author_id, status, metadata)
  VALUES (trim(p_post_path), trim(p_title), owner_id, p_status, COALESCE(p_metadata, '{}'::jsonb))
  ON CONFLICT (post_path) DO UPDATE
  SET title = EXCLUDED.title,
      author_id = EXCLUDED.author_id,
      status = EXCLUDED.status,
      metadata = EXCLUDED.metadata
  RETURNING * INTO item;
  PERFORM public.write_audit_log('content.upsert', 'content', item.id::TEXT,
    jsonb_build_object('post_path', item.post_path, 'status', item.status));
  RETURN item;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_content_version(
  p_content_item_id UUID,
  p_source_markdown TEXT,
  p_checksum TEXT
)
RETURNS public.content_versions
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  item public.content_items;
  version_row public.content_versions;
  next_version INTEGER;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Author access required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO item FROM public.content_items WHERE id = p_content_item_id;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Content item not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_admin() AND item.author_id <> auth.uid() THEN
    RAISE EXCEPTION 'Authors may only version their own content' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM public.content_versions
  WHERE content_item_id = p_content_item_id;
  INSERT INTO public.content_versions (content_item_id, version_number, source_markdown, checksum, created_by)
  VALUES (p_content_item_id, next_version, p_source_markdown, trim(p_checksum), auth.uid())
  RETURNING * INTO version_row;
  UPDATE public.content_items SET updated_at = NOW() WHERE id = p_content_item_id;
  PERFORM public.write_audit_log('content.version.create', 'content', p_content_item_id::TEXT,
    jsonb_build_object('version_number', next_version));
  RETURN version_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.moderate_content(
  p_content_item_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.content_items
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  item public.content_items;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('draft', 'pending_review', 'published', 'archived', 'rejected') THEN
    RAISE EXCEPTION 'Invalid content status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.content_items
  SET status = p_status,
      review_reason = NULLIF(trim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = NOW()
  WHERE id = p_content_item_id
  RETURNING * INTO item;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Content item not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.write_audit_log('content.moderate', 'content', p_content_item_id::TEXT,
    jsonb_build_object('status', p_status, 'reason', p_reason));
  RETURN item;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(p_limit INTEGER DEFAULT 100)
RETURNS SETOF public.audit_logs
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Superadmin access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT LEAST(GREATEST(p_limit, 1), 500);
END;
$$;

-- ---------------------------------------------------------------------------
-- Media library
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_bucket TEXT NOT NULL DEFAULT 'media',
  storage_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  public_url TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS media_assets_created_idx
  ON public.media_assets (created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_uploader_idx
  ON public.media_assets (uploaded_by, created_at DESC);

CREATE OR REPLACE FUNCTION public.register_media_asset(
  p_storage_path TEXT,
  p_file_name TEXT,
  p_mime_type TEXT,
  p_size_bytes BIGINT,
  p_public_url TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS public.media_assets
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  asset public.media_assets;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_mime_type NOT LIKE 'image/%' AND p_mime_type NOT LIKE 'video/%' AND p_mime_type NOT LIKE 'audio/%' THEN
    RAISE EXCEPTION 'Unsupported media type' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes <= 0 OR p_size_bytes > 104857600 THEN
    RAISE EXCEPTION 'Media file must be between 1 byte and 100 MB' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.media_assets (
    storage_path, file_name, mime_type, size_bytes, public_url, uploaded_by, metadata
  )
  VALUES (
    trim(p_storage_path), trim(p_file_name), lower(trim(p_mime_type)),
    p_size_bytes, trim(p_public_url), auth.uid(), COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (storage_path) DO UPDATE
  SET file_name = EXCLUDED.file_name,
      mime_type = EXCLUDED.mime_type,
      size_bytes = EXCLUDED.size_bytes,
      public_url = EXCLUDED.public_url,
      metadata = EXCLUDED.metadata,
      deleted_at = NULL
  RETURNING * INTO asset;
  PERFORM public.write_audit_log(
    'media.upload',
    'media',
    asset.id::TEXT,
    jsonb_build_object('file_name', asset.file_name, 'mime_type', asset.mime_type)
  );
  RETURN asset;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_media()
RETURNS SETOF public.media_assets
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT * FROM public.media_assets
  WHERE deleted_at IS NULL
  ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_media(p_media_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public, pg_temp
LANGUAGE plpgsql
AS $$
DECLARE
  asset public.media_assets;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.media_assets
  SET deleted_at = COALESCE(deleted_at, NOW())
  WHERE id = p_media_id
  RETURNING * INTO asset;
  IF asset.id IS NULL THEN
    RAISE EXCEPTION 'Media asset not found' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM storage.objects
  WHERE bucket_id = asset.storage_bucket AND name = asset.storage_path;
  PERFORM public.write_audit_log('media.delete', 'media', p_media_id::TEXT,
    jsonb_build_object('storage_path', asset.storage_path));
  RETURN TRUE;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- There can be at most one active superadmin. The bootstrap below selects the
-- verified GitHub OAuth identity, not a user-entered profile field.
DO $$
DECLARE
  primary_profile_id UUID;
BEGIN
  SELECT p.id INTO primary_profile_id
  FROM public.profiles p
  JOIN auth.identities i ON i.user_id = p.id
  WHERE i.provider = 'github'
    AND lower(COALESCE(
      i.identity_data->>'user_name',
      i.identity_data->>'login',
      i.identity_data->>'preferred_username'
    )) = 'levia808'
  ORDER BY p.created_at
  LIMIT 1;

  IF primary_profile_id IS NULL THEN
    RAISE NOTICE 'GitHub identity Levia808 is not linked yet; it will be promoted on the first GitHub sign-in.';
  ELSE
    UPDATE public.profiles
    SET role = 'user'
    WHERE id <> primary_profile_id
      AND role IN ('admin', 'superadmin');

    UPDATE public.profiles
    SET role = 'superadmin',
        account_status = 'active'
    WHERE id = primary_profile_id;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_single_superadmin_idx
  ON public.profiles (role)
  WHERE role = 'superadmin';

DROP POLICY IF EXISTS profiles_select_public ON public.profiles;
CREATE POLICY profiles_select_public
  ON public.profiles FOR SELECT
  USING (account_status <> 'deleted');

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id AND account_status = 'active')
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS content_items_select_published ON public.content_items;
CREATE POLICY content_items_select_published
  ON public.content_items FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS content_items_select_own ON public.content_items;
CREATE POLICY content_items_select_own
  ON public.content_items FOR SELECT TO authenticated
  USING (author_id = auth.uid());

DROP POLICY IF EXISTS content_versions_select_own ON public.content_versions;
CREATE POLICY content_versions_select_own
  ON public.content_versions FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.content_items c
      WHERE c.id = content_item_id AND c.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS comments_select_visible ON public.comments;
DROP POLICY IF EXISTS comments_select_public ON public.comments;
CREATE POLICY comments_select_visible
  ON public.comments FOR SELECT
  USING (
    (moderation_status = 'approved' AND deleted_at IS NULL)
    OR auth.uid() = user_id
  );

DROP POLICY IF EXISTS comments_insert_authenticated ON public.comments;
CREATE POLICY comments_insert_authenticated
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS comments_update_own ON public.comments;
CREATE POLICY comments_update_own
  ON public.comments FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS comments_delete_own ON public.comments;
CREATE POLICY comments_delete_own
  ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS comment_reports_insert_own ON public.comment_reports;
CREATE POLICY comment_reports_insert_own
  ON public.comment_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS comment_reports_select_own ON public.comment_reports;
CREATE POLICY comment_reports_select_own
  ON public.comment_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

DROP POLICY IF EXISTS audit_logs_select_superadmin ON public.audit_logs;
CREATE POLICY audit_logs_select_superadmin
  ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_superadmin());

DROP POLICY IF EXISTS media_assets_select_public ON public.media_assets;
CREATE POLICY media_assets_select_public
  ON public.media_assets FOR SELECT
  USING (deleted_at IS NULL);

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, display_name, bio, avatar_url,
  github_username, github_avatar_url, website, created_at, updated_at
) ON public.profiles TO anon, authenticated;
GRANT UPDATE (
  username, display_name, bio, avatar_url,
  github_username, github_avatar_url, website
) ON public.profiles TO authenticated;

GRANT SELECT ON public.content_items TO anon, authenticated;
GRANT SELECT ON public.content_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO anon, authenticated;
REVOKE UPDATE ON public.comments FROM anon, authenticated;
GRANT UPDATE (content) ON public.comments TO authenticated;
GRANT SELECT, INSERT ON public.comment_reports TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT SELECT ON public.media_assets TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.try_claim_primary_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.report_comment(BIGINT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_comments(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_reports(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_comment(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_account_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_update_role(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_content(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_content_item(TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_content_version(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_content(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_media_asset(TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_media() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_media(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.write_audit_log(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_notification(UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Avatars remain public, but writes are isolated to the caller's UUID folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('avatars', 'avatars', true, 5242880)
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 5242880;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  104857600,
  ARRAY['image/*', 'video/*', 'audio/*']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = true,
    file_size_limit = 104857600,
    allowed_mime_types = ARRAY['image/*', 'video/*', 'audio/*']::TEXT[];

DROP POLICY IF EXISTS avatars_select_public ON storage.objects;
CREATE POLICY avatars_select_public
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS media_select_public ON storage.objects;
CREATE POLICY media_select_public
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS media_insert_admin ON storage.objects;
CREATE POLICY media_insert_admin
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.is_admin() AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS media_update_admin ON storage.objects;
CREATE POLICY media_update_admin
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'media' AND public.is_admin() AND (storage.foldername(name))[1] = auth.uid()::TEXT)
  WITH CHECK (bucket_id = 'media' AND public.is_admin() AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS media_delete_admin ON storage.objects;
CREATE POLICY media_delete_admin
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'media' AND public.is_admin() AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- The verified GitHub identity Levia808 is the only superadmin.
