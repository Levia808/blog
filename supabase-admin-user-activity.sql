-- 后台用户管理扩展: 查看用户全站行为 (动态/点赞/评论/文章评论/审计)
-- 幂等: 可重复执行
-- 用法: Supabase SQL Editor 执行本文件
-- 配套: Edge Function admin-update-profile (头像/昵称修改, service role)

-- 聚合用户行为时间线 (按时间倒序)
CREATE OR REPLACE FUNCTION public.admin_list_user_activity(p_user_id UUID)
RETURNS TABLE (
  at TIMESTAMPTZ,
  kind TEXT,
  title TEXT,
  detail TEXT
)
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
  /* 动态发布 */
  SELECT m.created_at, 'moment'::TEXT, '发布动态',
         LEFT(m.content, 60) || CASE WHEN LENGTH(m.content) > 60 THEN '…' ELSE '' END
  FROM public.moments m
  WHERE m.user_id = p_user_id
  UNION ALL
  /* 动态点赞 */
  SELECT ml.created_at, 'moment_like'::TEXT, '点赞动态',
         LEFT(m.content, 60) || CASE WHEN LENGTH(m.content) > 60 THEN '…' ELSE '' END
  FROM public.moment_likes ml
  JOIN public.moments m ON m.id = ml.moment_id
  WHERE ml.user_id = p_user_id
  UNION ALL
  /* 动态评论 */
  SELECT mc.created_at, 'comment'::TEXT, CASE WHEN mc.parent_id IS NULL THEN '评论动态' ELSE '回复评论' END,
         LEFT(mc.content, 60) || CASE WHEN LENGTH(mc.content) > 60 THEN '…' ELSE '' END
  FROM public.moment_comments mc
  WHERE mc.user_id = p_user_id
  UNION ALL
  /* 文章评论 */
  SELECT c.created_at, 'post_comment'::TEXT, '评论文章 ' || COALESCE(c.post_path, ''),
         LEFT(c.content, 60) || CASE WHEN LENGTH(c.content) > 60 THEN '…' ELSE '' END
  FROM public.comments c
  WHERE c.user_id = p_user_id
  UNION ALL
  /* 审计日志 (登录/角色/状态变更等) */
  SELECT a.created_at, 'audit'::TEXT, COALESCE(a.action, ''),
         COALESCE(a.metadata::TEXT, '')
  FROM public.audit_logs a
  WHERE a.actor_id = p_user_id OR a.entity_id = p_user_id
  ORDER BY at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_user_activity(UUID) TO authenticated;
