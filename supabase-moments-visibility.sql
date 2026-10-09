-- ============================================================
-- supabase-moments-visibility.sql · 动态可见性控制 + 删除确认
-- 幂等可重复执行
--   ① moments 表新增可见性字段 (公开/白名单/黑名单)
--   ② moments_select RLS: 管理员豁免 + 可见性过滤 (服务端强制, 不可绕过)
--   ③ moments_delete 策略确认 (本人或管理员可删)
-- ============================================================

-- ① 可见性字段
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS visible_to JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.moments ADD COLUMN IF NOT EXISTS hidden_from JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ② 可见性 RLS (替换旧公开 select)
DROP POLICY IF EXISTS moments_select ON public.moments;
CREATE POLICY moments_select ON public.moments FOR SELECT USING (
  public.is_admin()
  OR visibility = 'public'
  OR (visibility = 'whitelist' AND visible_to @> to_jsonb(auth.uid()::text))
  OR (visibility = 'blacklist' AND NOT (hidden_from @> to_jsonb(auth.uid()::text)))
);

-- ③ 删除策略确认 (本人或管理员, 幂等)
DROP POLICY IF EXISTS moments_delete ON public.moments;
CREATE POLICY moments_delete ON public.moments
  FOR DELETE USING (auth.uid() = user_id OR public.is_admin());

-- 更新权限
GRANT SELECT, INSERT, UPDATE, DELETE ON public.moments TO authenticated;
