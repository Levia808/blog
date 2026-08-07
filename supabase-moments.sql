-- ============================================================
-- supabase-moments.sql · 「动态」栏目 (朋友圈风格)
-- 表: moments (动态) / moment_likes (点赞) / moment_comments (评论)
-- 权限: 动态公开浏览 · 管理员发布 · 注册用户点赞/评论
-- 幂等可重复执行
-- ============================================================

-- ① 动态表
CREATE TABLE IF NOT EXISTS public.moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ② 点赞表 (同一用户对同一动态只能赞一次)
CREATE TABLE IF NOT EXISTS public.moment_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (moment_id, user_id)
);

-- ③ 动态评论表
CREATE TABLE IF NOT EXISTS public.moment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ④ RLS
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS moments_select ON public.moments;
DROP POLICY IF EXISTS moments_insert ON public.moments;
DROP POLICY IF EXISTS moments_delete ON public.moments;
DROP POLICY IF EXISTS likes_select ON public.moment_likes;
DROP POLICY IF EXISTS likes_insert ON public.moment_likes;
DROP POLICY IF EXISTS likes_delete ON public.moment_likes;
DROP POLICY IF EXISTS moment_comments_select ON public.moment_comments;
DROP POLICY IF EXISTS moment_comments_insert ON public.moment_comments;
DROP POLICY IF EXISTS moment_comments_delete ON public.moment_comments;

-- 动态: 公开浏览, 仅管理员(superadmin)发布/删除
CREATE POLICY moments_select ON public.moments FOR SELECT USING (true);
CREATE POLICY moments_insert ON public.moments FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY moments_delete ON public.moments FOR DELETE USING (public.is_admin());

-- 点赞: 公开浏览, 登录用户只能赞/取消自己的
CREATE POLICY likes_select ON public.moment_likes FOR SELECT USING (true);
CREATE POLICY likes_insert ON public.moment_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY likes_delete ON public.moment_likes FOR DELETE USING (auth.uid() = user_id);

-- 评论: 公开浏览, 登录用户写自己的, 管理员可删
CREATE POLICY moment_comments_select ON public.moment_comments FOR SELECT USING (true);
CREATE POLICY moment_comments_insert ON public.moment_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY moment_comments_delete ON public.moment_comments FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- ⑤ 权限
GRANT SELECT ON public.moments TO anon, authenticated;
GRANT INSERT, DELETE ON public.moments TO authenticated;
GRANT SELECT ON public.moment_likes TO anon, authenticated;
GRANT INSERT, DELETE ON public.moment_likes TO authenticated;
GRANT SELECT ON public.moment_comments TO anon, authenticated;
GRANT INSERT, DELETE ON public.moment_comments TO authenticated;

-- ⑥ 更新时间触发器
DROP TRIGGER IF EXISTS moments_set_updated_at ON public.moments;
CREATE TRIGGER moments_set_updated_at
  BEFORE UPDATE ON public.moments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
