-- Fix moments edit/delete and like upsert permissions. Safe to run repeatedly.
DROP POLICY IF EXISTS moments_update ON public.moments;
CREATE POLICY moments_update ON public.moments
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS moments_delete ON public.moments;
CREATE POLICY moments_delete ON public.moments
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

GRANT UPDATE, DELETE ON public.moments TO authenticated;

DROP POLICY IF EXISTS likes_update ON public.moment_likes;
CREATE POLICY likes_update ON public.moment_likes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT UPDATE ON public.moment_likes TO authenticated;
