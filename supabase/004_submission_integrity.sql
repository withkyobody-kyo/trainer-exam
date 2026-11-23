begin;
alter table public.trainer_attempts add column if not exists exam text, add column if not exists subject text;
update public.trainer_attempts t set exam=c.exam,subject=c.subject from trainer_private.catalog c where c.id=t.question_id;
alter table public.trainer_attempts alter column exam set not null, alter column subject set not null;
create or replace function trainer_private.put_item(p_operation uuid,p_key text,p_expected bigint,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user(); old public.trainer_items; op trainer_private.operations;
 b jsonb:=p_body; fp text; rev bigint; now_ms bigint:=floor(extract(epoch from clock_timestamp())*1000);
 submitted record; phase integer; oldphase integer; budget bigint; deadline bigint; sid text;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if p_key is null or length(p_key)>240 or p_key !~ '^(session|bookmark|note):[A-Za-z0-9_.:-]+$' or p_operation is null or p_expected is null or p_expected<0 or b is null or jsonb_typeof(b)<>'object' or octet_length(b::text)>2000000 then raise exception '저장 자료의 형식이나 크기를 확인해 주세요.'; end if;
 fp:=encode(sha256(convert_to(jsonb_build_object('key',p_key,'body',p_body,'expected',p_expected)::text,'UTF8')),'hex');
 select * into op from trainer_private.operations where user_id=u and operation_id=p_operation;
 select * into old from public.trainer_items where user_id=u and item_key=p_key for update;
 if op.operation_id is not null then
  if op.fingerprint<>fp then raise exception '같은 저장 번호에 다른 내용이 전달되었습니다.'; end if;
  return jsonb_build_object('status','saved','item',to_jsonb(old),'retry',true);
 end if;
 if coalesce(old.revision,0)<>p_expected then return jsonb_build_object('status','conflict','item',to_jsonb(old)); end if;
 if p_key like 'session:%' and not coalesce((b->>'deleted')::boolean,false) then
  sid:=substr(p_key,9);
  if coalesce((old.body->>'deleted')::boolean,false) then raise exception '종료·초기화한 풀이입니다. 서버 기록을 선택하고 새 학습을 시작해 주세요.'; end if;
  if b->>'id' is null or b->>'exam' is null or b->>'mode' is null or b->'ids' is null or b->>'id'<>sid or b->>'exam' not in ('health','sports') or b->>'mode' not in ('subject','random','mock','review') or jsonb_typeof(b->'ids')<>'array' or jsonb_array_length(b->'ids') not between 1 and 4000 then raise exception '풀이 세션 형식이 올바르지 않습니다.'; end if;
  if exists(select 1 from jsonb_array_elements_text(b->'ids') q(id) left join trainer_private.catalog c on c.id=q.id where c.id is null or c.exam<>b->>'exam') then raise exception '동기화할 수 없는 문제입니다. 직접 추가한 문제는 이 기기에서 이용해 주세요.'; end if;
  if (select count(distinct x) from jsonb_array_elements_text(b->'ids') t(x))<>jsonb_array_length(b->'ids') then raise exception '출제 목록에 중복 문제가 있습니다.'; end if;
  if old.revision is not null and not coalesce((old.body->>'deleted')::boolean,false) then
   if old.body->'ids'<>b->'ids' or old.body->>'exam'<>b->>'exam' or old.body->>'mode'<>b->>'mode' then raise exception '이미 시작한 풀이의 문제 목록은 변경할 수 없습니다.'; end if;
   if coalesce((old.body->>'completed')::boolean,false) and not coalesce((b->>'completed')::boolean,false) then raise exception '완료한 풀이는 다시 시작할 수 없습니다. 새 연습을 시작해 주세요.'; end if;
   b:=jsonb_set(b,'{startedAt}',old.body->'startedAt');
  else
   b:=jsonb_set(b,'{startedAt}',to_jsonb(least(now_ms,greatest(now_ms-31536000000,coalesce((b->>'startedAt')::bigint,now_ms)))));
  end if;
  for submitted in select question_id,choice from public.trainer_attempts where user_id=u and session_id=sid loop
   if (b->'answers'->>submitted.question_id)::integer is distinct from submitted.choice then raise exception '이미 제출한 답은 변경할 수 없습니다.'; end if;
  end loop;
  if b->>'mode'='mock' and not coalesce((b->>'completed')::boolean,false) then
   phase:=coalesce((b->>'phase')::integer,0);
   if phase not between 0 and (case when b->>'exam'='health' then 1 else 0 end) or jsonb_typeof(b->'budgets')<>'array' or jsonb_typeof(b->'groups')<>'array' then raise exception '모의고사 교시 설정이 올바르지 않습니다.'; end if;
   budget:=(b->'budgets'->>phase)::bigint;
   if budget not between 60000 and 18000000 then raise exception '모의고사 제한시간이 올바르지 않습니다.'; end if;
   if old.revision is not null and not coalesce((old.body->>'deleted')::boolean,false) then
    if old.body->'budgets'<>b->'budgets' or old.body->'groups'<>b->'groups' or old.body->'rules'<>b->'rules' then raise exception '모의고사 구성과 시간은 시작 후 변경할 수 없습니다.'; end if;
    oldphase:=coalesce((old.body->>'phase')::integer,0);
    if phase=oldphase then
     b:=jsonb_set(b,'{deadline}',old.body->'deadline');
     b:=jsonb_set(b,'{phaseStartedAt}',old.body->'phaseStartedAt');
     if old.body->>'stage'='break' and b->>'stage'<>'break' then raise exception '제출한 교시로 돌아갈 수 없습니다.'; end if;
     if b->>'stage'='break' then
      b:=jsonb_set(b,'{breakDeadline}',coalesce(old.body->'breakDeadline',to_jsonb(now_ms+coalesce((b->'rules'->>'breakMinutes')::integer,20)*60000)));
     end if;
    elsif phase=oldphase+1 and old.body->>'stage'='break' and b->>'stage'='quiz' then
     deadline:=least(now_ms,coalesce((old.body->>'breakDeadline')::bigint,now_ms))+budget;
     b:=jsonb_set(jsonb_set(b,'{deadline}',to_jsonb(deadline)),'{phaseStartedAt}',to_jsonb(deadline-budget));
    else raise exception '교시 순서가 올바르지 않습니다.'; end if;
   else
    if phase<>0 or b->>'stage'<>'quiz' then raise exception '새 모의고사는 1교시부터 시작해 주세요.'; end if;
    deadline:=least(now_ms+budget,coalesce((b->>'deadline')::bigint,now_ms+budget));
    b:=jsonb_set(jsonb_set(b,'{deadline}',to_jsonb(deadline)),'{phaseStartedAt}',to_jsonb(deadline-budget));
   end if;
  end if;
 elsif p_key like 'note:%' then
  if length(coalesce(b->>'text',''))>10000 then raise exception '메모는 10,000자 이내로 입력해 주세요.'; end if;
 elsif p_key like 'bookmark:%' then
  if jsonb_typeof(b->'saved')<>'boolean' then raise exception '북마크 형식이 올바르지 않습니다.'; end if;
 end if;
 rev:=coalesce(old.revision,0)+1;
 insert into public.trainer_items(user_id,item_key,revision,body) values(u,p_key,rev,b)
 on conflict(user_id,item_key) do update set revision=excluded.revision,body=excluded.body,updated_at=clock_timestamp();
 insert into trainer_private.operations(user_id,operation_id,item_key,fingerprint,revision) values(u,p_operation,p_key,fp,rev);
 select * into old from public.trainer_items where user_id=u and item_key=p_key;
 return jsonb_build_object('status','saved','item',to_jsonb(old));
end $$;
create or replace function trainer_private.submit_attempts(p_session text,p_answers jsonb,p_online boolean,p_reveal boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user(); s jsonb; a jsonb; q trainer_private.catalog; existing public.trainer_attempts;
 aid uuid; chosen integer; valid boolean; first_one boolean; now_at timestamptz; result jsonb:='[]'; duration bigint; already_seen boolean;
begin
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select body into s from public.trainer_items where user_id=u and item_key='session:'||p_session for update;
 if s is null or coalesce((s->>'deleted')::boolean,false) then raise exception '먼저 풀이 세션을 저장해 주세요.'; end if;
 if jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)>4000 then raise exception '응답 형식이 올바르지 않습니다.'; end if;
 for a in select value from jsonb_array_elements(p_answers) loop
  aid:=(a->>'id')::uuid; chosen:=(a->>'choice')::integer;
  if aid is null or chosen is null or a->>'questionId' is null or chosen not between 1 and 4 or not (s->'ids' ? (a->>'questionId')) then raise exception '출제된 문제와 선택한 답을 확인해 주세요.'; end if;
  select * into existing from public.trainer_attempts where user_id=u and session_id=p_session and question_id=a->>'questionId';
  if existing.attempt_id is not null then
   if existing.choice<>chosen then raise exception '이미 제출한 답은 변경할 수 없습니다.'; end if;
   result:=result||jsonb_build_array(jsonb_build_object('id',existing.attempt_id,'questionId',existing.question_id,'correct',existing.correct,'duplicate',true)); continue;
  end if;
  if exists(select 1 from public.trainer_attempts where attempt_id=aid) then raise exception '다른 응답에 사용된 기록 번호입니다.'; end if;
  select * into q from trainer_private.catalog where id=a->>'questionId';
  now_at:=clock_timestamp();
  already_seen:=exists(select 1 from trainer_private.exposures where user_id=u and question_id=q.id)
     or exists(select 1 from trainer_private.legacy_records where user_id=u and question_id=q.id and attempts>0)
     or exists(select 1 from public.trainer_attempts where user_id=u and question_id=q.id);
  valid:=p_online and q.answers is not null and not coalesce((s->>'completed')::boolean,false);
  if s->>'mode'='mock' then
   valid:=valid and s->>'stage'='quiz' and (s->'groups'->coalesce((s->>'phase')::integer,0) ? q.id)
    and extract(epoch from now_at)*1000<=coalesce((s->>'deadline')::bigint,0);
  end if;
  duration:=least(86400000,greatest(0,coalesce((a->>'elapsedMs')::bigint,0)));
  insert into public.trainer_attempts(attempt_id,user_id,session_id,question_id,exam,subject,choice,correct,reported_at,elapsed_ms,mode,revealed,eligible,source,bank_version)
  values(aid,u,p_session,q.id,q.exam,q.subject,chosen,case when q.answers is null then null else chosen=any(q.answers) end,
   case when a->>'answeredAt' is null then null else to_timestamp((a->>'answeredAt')::double precision/1000) end,
   duration,s->>'mode',p_reveal,valid,case when p_online then 'online' else 'offline' end,q.bank_version);
  first_one:=false;
  if valid and not already_seen then
   insert into trainer_private.first_responses(user_id,question_id,bank_version,attempt_id) values(u,q.id,q.bank_version,aid) on conflict do nothing;
   first_one:=found;
   update public.trainer_attempts set is_first=first_one where attempt_id=aid;
  end if;
  if p_reveal then insert into trainer_private.exposures(user_id,question_id) values(u,q.id) on conflict do nothing; end if;
  result:=result||jsonb_build_array(jsonb_build_object('id',aid,'questionId',q.id,'correct',case when q.answers is null then null else chosen=any(q.answers) end,'eligible',valid,'first',first_one));
 end loop;
 return result;
end $$;
commit;
