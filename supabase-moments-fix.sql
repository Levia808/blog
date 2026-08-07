-- 修复: 点赞 upsert 需要 UPDATE 权限 (moment_likes 缺 UPDATE RLS 策略)
DROP POLICY IF EXISTS likes_update ON public.moment_likes;
CREATE POLICY likes_update ON public.moment_likes
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT UPDATE ON public.moment_likes TO authenticated;
