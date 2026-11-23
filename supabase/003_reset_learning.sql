begin;
create or replace function trainer_private.reset_exam(p_exam text,p_operation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user();
begin
 if p_exam is null or p_exam not in ('health','sports') or p_operation is null then raise exception '초기화할 시험을 확인해 주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from trainer_private.operations where user_id=u and operation_id=p_operation and item_key='reset:'||p_exam) then return; end if;
 delete from trainer_private.first_responses where user_id=u and question_id in(select id from trainer_private.catalog where exam=p_exam);
 delete from public.trainer_attempts where user_id=u and question_id in(select id from trainer_private.catalog where exam=p_exam);
 delete from trainer_private.legacy_records where user_id=u and question_id in(select id from trainer_private.catalog where exam=p_exam);
 delete from trainer_private.exposures where user_id=u and question_id in(select id from trainer_private.catalog where exam=p_exam);
 update public.trainer_items set body='{"deleted":true}'::jsonb,revision=revision+1,updated_at=clock_timestamp()
 where user_id=u and (body->>'exam'=p_exam or substr(item_key,strpos(item_key,':')+1) in(select id from trainer_private.catalog where exam=p_exam));
 insert into trainer_private.operations(user_id,operation_id,item_key,fingerprint,revision) values(u,p_operation,'reset:'||p_exam,'reset',1);
end $$;
create or replace function public.trainer_reset_exam(p_exam text,p_operation uuid) returns void language sql security invoker set search_path='' as $$select trainer_private.reset_exam(p_exam,p_operation)$$;
revoke all on function trainer_private.reset_exam(text,uuid),public.trainer_reset_exam(text,uuid) from public,anon,authenticated;
grant execute on function trainer_private.reset_exam(text,uuid),public.trainer_reset_exam(text,uuid) to authenticated;
commit;
