-- Expose only invoker wrappers in the API schema; implementations retain their
-- active session, member ownership, staff role and MFA checks privately.
alter function public.marriage_portrait_stage_resume() set schema marriage;
alter function marriage.marriage_portrait_stage_resume() rename to portrait_stage_resume;
alter function public.marriage_admin_portrait_queue() set schema marriage;
alter function marriage.marriage_admin_portrait_queue() rename to admin_portrait_queue;
alter function public.marriage_admin_portrait_media(uuid) set schema marriage;
alter function marriage.marriage_admin_portrait_media(uuid) rename to admin_portrait_media;
alter function public.marriage_admin_portrait_decide(uuid,boolean,text) set schema marriage;
alter function marriage.marriage_admin_portrait_decide(uuid,boolean,text) rename to admin_portrait_decide;
create function public.marriage_portrait_stage_resume() returns jsonb language sql security invoker set search_path='' as $$select marriage.portrait_stage_resume()$$;
create function public.marriage_admin_portrait_queue() returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_portrait_queue()$$;
create function public.marriage_admin_portrait_media(photo uuid) returns jsonb language sql security invoker set search_path='' as $$select marriage.admin_portrait_media($1)$$;
create function public.marriage_admin_portrait_decide(photo uuid,approved boolean,review_reason text) returns boolean language sql security invoker set search_path='' as $$select marriage.admin_portrait_decide($1,$2,$3)$$;
revoke all on function public.marriage_portrait_stage_resume(),public.marriage_admin_portrait_queue(),public.marriage_admin_portrait_media(uuid),public.marriage_admin_portrait_decide(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.marriage_portrait_stage_resume(),public.marriage_admin_portrait_queue(),public.marriage_admin_portrait_media(uuid),public.marriage_admin_portrait_decide(uuid,boolean,text) to authenticated;
