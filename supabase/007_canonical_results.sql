begin;
create or replace function trainer_private.summarize(p_ids jsonb,p_answers jsonb) returns jsonb
language sql security invoker set search_path='' as $$
with rows as (
 select c.id,c.subject,c.answers is not null as known,(p_answers->>c.id)::integer as choice,
 case when c.answers is null then null else (p_answers->>c.id)::integer=any(c.answers) end as correct
 from jsonb_array_elements_text(p_ids) i(id) join trainer_private.catalog c using(id)
), counts as (
 select subject,count(*) total,count(*) filter(where correct) correct,count(*) filter(where known and choice is not null and not correct) wrong,
 count(*) filter(where choice is null) unanswered,count(*) filter(where not known and choice is not null) ungraded,count(*) filter(where known) gradeable
 from rows group by subject
), total as (
 select sum(total) total,sum(correct) correct,sum(wrong) wrong,sum(unanswered) unanswered,sum(ungraded) ungraded,sum(gradeable) gradeable,
 jsonb_object_agg(subject,to_jsonb(counts)-'subject') subjects from counts
)
select jsonb_build_object('summary',to_jsonb(total)||jsonb_build_object('rate',round(100.0*correct/nullif(gradeable,0))),
 'serverVerdicts',(select coalesce(jsonb_object_agg(id,correct) filter(where choice is not null),'{}') from rows),'serverVerified',true) from total
$$;
revoke all on function trainer_private.summarize(jsonb,jsonb) from public,anon,authenticated;
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
  if coalesce((b->>'completed')::boolean,false) then
   b:=b||trainer_private.summarize(b->'ids',coalesce(b->'answers','{}'::jsonb));
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
commit;
