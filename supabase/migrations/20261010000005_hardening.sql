-- Recomendações do Security Advisor do Supabase
alter function public.set_updated_at() set search_path = public;
alter function public.forbid_affiliate_url_change() set search_path = public;
alter function public.is_end_user() set search_path = public;
-- Funções de gatilho não devem ser chamáveis via /rpc (os gatilhos continuam funcionando)
revoke execute on function public.audit_trigger() from public, anon, authenticated;
revoke execute on function public.check_same_owner() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.publications_guard() from public, anon, authenticated;
revoke execute on function public.publications_sync_jobs() from public, anon, authenticated;
-- Intencionalmente públicas: get_landing() e register_click() (página intermediária).
-- account_secrets e oauth_states têm RLS sem políticas de propósito: só o service role acessa.
