-- 文章评论区: 树状回复 + 管理员编辑/删除
-- 幂等: 可重复执行
-- 用法: Supabase SQL Editor 执行本文件

-- ① 评论树状回复: 加 parent_id (回复的回复递归嵌套)
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES public.comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS comments_parent_idx ON public.comments (parent_id);

-- ② 管理员可编辑任意评论 (复用 is_admin, SECURITY DEFINER)
DROP POLICY IF EXISTS comments_update_admin ON public.comments;
CREATE POLICY comments_update_admin
  ON public.comments FOR UPDATE TO authenticated
  USING (public.is_admin() AND deleted_at IS NULL)
  WITH CHECK (public.is_admin());

-- ③ 管理员可删除任意评论
DROP POLICY IF EXISTS comments_delete_admin ON public.comments;
CREATE POLICY comments_delete_admin
  ON public.comments FOR DELETE TO authenticated
  USING (public.is_admin());
