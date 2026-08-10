-- ============================================================
-- supabase-moments-fix.sql · 动态模块权限一键修复 (幂等可重复执行)
-- 覆盖:
--   ① 动态编辑/删除 + 点赞 upsert (历史修复, 保留)
--   ② 动态发布: superadmin → staff (作者 author + superadmin 可发动态)
--   ③ 评论 RLS: moment_comments SELECT/INSERT/DELETE 策略 + 授权
--   ④ 评论点赞 RLS: moment_comment_likes 全策略 + 授权
--   ⑤ Realtime: moment_comments 加入 supabase_realtime 发布 (评论实时同步)
-- 前提: 已执行 supabase-setup.sql (提供 has_any_role / is_staff / is_admin)
-- ============================================================

-- ① 动态编辑/删除与点赞 upsert (原 fix, 保留)
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

-- ② 动态发布: staff (author / superadmin) 可发动态
DROP POLICY IF EXISTS moments_insert ON public.moments;
CREATE POLICY moments_insert ON public.moments
  FOR INSERT WITH CHECK (public.is_staff());

-- ③ 评论 RLS: 公开浏览, 登录用户写自己的, 发送者或管理员可删
DROP POLICY IF EXISTS moment_comments_select ON public.moment_comments;
DROP POLICY IF EXISTS moment_comments_insert ON public.moment_comments;
DROP POLICY IF EXISTS moment_comments_delete ON public.moment_comments;
CREATE POLICY moment_comments_select ON public.moment_comments FOR SELECT USING (true);
CREATE POLICY moment_comments_insert ON public.moment_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY moment_comments_delete ON public.moment_comments FOR DELETE USING (auth.uid() = user_id OR public.is_admin());
GRANT SELECT ON public.moment_comments TO anon, authenticated;
GRANT INSERT, DELETE ON public.moment_comments TO authenticated;

-- ④ 评论点赞 RLS: 公开浏览, 登录用户赞/取消自己的
ALTER TABLE public.moment_comment_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mcl_select ON public.moment_comment_likes;
DROP POLICY IF EXISTS mcl_insert ON public.moment_comment_likes;
DROP POLICY IF EXISTS mcl_update ON public.moment_comment_likes;
DROP POLICY IF EXISTS mcl_delete ON public.moment_comment_likes;
CREATE POLICY mcl_select ON public.moment_comment_likes FOR SELECT USING (true);
CREATE POLICY mcl_insert ON public.moment_comment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY mcl_update ON public.moment_comment_likes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY mcl_delete ON public.moment_comment_likes FOR DELETE USING (auth.uid() = user_id);
GRANT SELECT ON public.moment_comment_likes TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.moment_comment_likes TO authenticated;

-- ⑤ Realtime 发布: moment_comments 加入实时推送 (若未加入则追加)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'moment_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.moment_comments;
  END IF;
END $$;
