-- Trainer Exam Cloud v1. No passwords or privileged API keys belong in this file.
begin;
create schema if not exists trainer_private;
revoke all on schema trainer_private from public, anon, authenticated;
grant usage on schema trainer_private to authenticated;
create table if not exists trainer_private.catalog (
 id text primary key, exam text not null check(exam in ('health','sports')), subject text not null,
 year integer, question_type text not null, difficulty text not null,
 answers integer[], bank_version text not null,
 check(answers is null or (cardinality(answers)>0 and answers <@ array[1,2,3,4]))
);
create table if not exists trainer_private.admins(user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists trainer_private.settings(id boolean primary key default true check(id), min_sample integer not null default 50 check(min_sample between 5 and 10000));
insert into trainer_private.settings(id) values(true) on conflict do nothing;
create table if not exists public.trainer_items (
 user_id uuid not null references auth.users(id) on delete cascade, item_key text not null,
 revision bigint not null default 1, body jsonb not null, updated_at timestamptz not null default clock_timestamp(),
 primary key(user_id,item_key), check(octet_length(body::text)<=2000000)
);
create table if not exists trainer_private.operations (
 user_id uuid not null references auth.users(id) on delete cascade, operation_id uuid not null,
 item_key text not null, fingerprint text not null, revision bigint not null,
 created_at timestamptz not null default clock_timestamp(), primary key(user_id,operation_id)
);
create table if not exists public.trainer_attempts (
 attempt_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 session_id text not null, question_id text not null references trainer_private.catalog(id),
 exam text not null, subject text not null,
 choice integer not null check(choice between 1 and 4), correct boolean,
 answered_at timestamptz not null default clock_timestamp(), reported_at timestamptz,
 elapsed_ms bigint not null check(elapsed_ms between 0 and 86400000), mode text not null,
 revealed boolean not null default false, eligible boolean not null default false, is_first boolean not null default false,
 source text not null check(source in ('online','offline')), bank_version text not null,
 unique(user_id,session_id,question_id)
);
create index if not exists trainer_attempts_stats on public.trainer_attempts(question_id,bank_version,is_first) where eligible;
create index if not exists trainer_attempts_user on public.trainer_attempts(user_id,question_id,answered_at);
create table if not exists trainer_private.exposures (
 user_id uuid references auth.users(id) on delete cascade, question_id text references trainer_private.catalog(id),
 seen_at timestamptz not null default clock_timestamp(), primary key(user_id,question_id)
);
create table if not exists trainer_private.first_responses (
 user_id uuid references auth.users(id) on delete cascade, question_id text references trainer_private.catalog(id),
 bank_version text not null, attempt_id uuid not null references public.trainer_attempts(attempt_id),
 primary key(user_id,question_id,bank_version)
);
create table if not exists trainer_private.legacy_records (
 user_id uuid references auth.users(id) on delete cascade, question_id text references trainer_private.catalog(id),
 attempts integer not null, correct integer not null, wrong integer not null,
 resolved boolean not null, last_at bigint not null, primary key(user_id,question_id),
 check(attempts=correct+wrong and attempts>=0 and correct>=0 and wrong>=0)
);
alter table public.trainer_items enable row level security;
alter table public.trainer_attempts enable row level security;
drop policy if exists trainer_items_owner_read on public.trainer_items;
create policy trainer_items_owner_read on public.trainer_items for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists trainer_attempts_owner_read on public.trainer_attempts;
create policy trainer_attempts_owner_read on public.trainer_attempts for select to authenticated using(user_id=(select auth.uid()));
revoke all on public.trainer_items,public.trainer_attempts from public,anon,authenticated;
grant select on public.trainer_items,public.trainer_attempts to authenticated;
revoke all on all tables in schema trainer_private from public,anon,authenticated;

create or replace function trainer_private.require_user() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null and coalesce(is_anonymous,false)=false) then
  raise exception '이메일 인증을 마친 계정으로 로그인해 주세요.' using errcode='42501';
 end if;
 return u;
end $$;

-- Per-item compare-and-swap. Successful retries are recognized before revision checking.
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

create or replace function trainer_private.mark_seen(p_ids text[]) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user();
begin
 if cardinality(p_ids)>4000 then raise exception '문제 수가 너무 많습니다.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 insert into trainer_private.exposures(user_id,question_id) select u,c.id from trainer_private.catalog c where c.id=any(p_ids) on conflict do nothing;
 update public.trainer_attempts set revealed=true where user_id=u and question_id=any(p_ids) and not revealed;
end $$;

create or replace function trainer_private.import_records(p_records jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user(); entry record; r jsonb; n integer:=0;
begin
 if jsonb_typeof(p_records)<>'object' or octet_length(p_records::text)>2000000 then raise exception '기존 기록의 형식 또는 크기를 확인해 주세요.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 for entry in select key,value from jsonb_each(p_records) loop
  r:=entry.value;
  if not exists(select 1 from trainer_private.catalog where id=entry.key) then continue; end if;
  if (r->>'attempts')::integer not between 0 and 1000000 or (r->>'correct')::integer<0 or (r->>'wrong')::integer<0 or (r->>'attempts')::integer<>(r->>'correct')::integer+(r->>'wrong')::integer then raise exception '기존 기록의 풀이 횟수가 올바르지 않습니다.'; end if;
  insert into trainer_private.legacy_records(user_id,question_id,attempts,correct,wrong,resolved,last_at)
   values(u,entry.key,(r->>'attempts')::integer,(r->>'correct')::integer,(r->>'wrong')::integer,coalesce((r->>'resolved')::boolean,false),coalesce((r->>'lastAt')::bigint,0))
   on conflict(user_id,question_id) do update set attempts=excluded.attempts,correct=excluded.correct,wrong=excluded.wrong,resolved=excluded.resolved,last_at=excluded.last_at
   where excluded.attempts>trainer_private.legacy_records.attempts;
  n:=n+1;
 end loop;
 return n;
end $$;

create or replace function trainer_private.progress() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user(); answer jsonb;
begin
 select coalesce(jsonb_object_agg(id,jsonb_build_object('exam',exam,'subject',subject,'attempts',attempts,'correct',correct,'wrong',wrong,
  'resolved',resolved,'lastAt',last_at,'lastResult',last_result)), '{}') into answer from (
  select c.id,c.exam,c.subject,coalesce(a.total,0)+coalesce(l.attempts,0) attempts,coalesce(a.ok,0)+coalesce(l.correct,0) correct,
   coalesce(a.bad,0)+coalesce(l.wrong,0) wrong, case when a.total>0 then a.last_result else coalesce(l.resolved,false) end resolved,
   greatest(coalesce(a.last_at,0),coalesce(l.last_at,0)) last_at,coalesce(a.last_result,l.resolved,false) last_result
  from trainer_private.catalog c left join trainer_private.legacy_records l on l.question_id=c.id and l.user_id=u
  left join lateral (select count(*) total,count(*) filter(where t.correct) ok,count(*) filter(where not t.correct) bad,
   max(floor(extract(epoch from t.answered_at)*1000))::bigint last_at,(array_agg(t.correct order by t.answered_at desc,t.attempt_id))[1] last_result
   from public.trainer_attempts t where t.user_id=u and t.question_id=c.id and t.correct is not null) a on true
  where coalesce(a.total,0)+coalesce(l.attempts,0)>0
 ) rows;
 return answer;
end $$;

create or replace function trainer_private.admin_stats(p_exam text,p_subject text,p_year integer,p_type text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user(); rows jsonb; threshold integer;
begin
 if not exists(select 1 from trainer_private.admins where user_id=u) then raise exception '관리자만 통계를 확인할 수 있습니다.' using errcode='42501'; end if;
 select min_sample into threshold from trainer_private.settings where id;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.first_rate nulls last,r.question_id),'[]') into rows from (
  select c.id question_id,c.exam,c.subject,c.year,c.question_type,c.difficulty,c.bank_version,
   count(t.attempt_id) filter(where t.is_first) respondents,
   round(100.0*count(*) filter(where t.is_first and t.correct)/nullif(count(*) filter(where t.is_first),0),1) first_rate,
   jsonb_build_array(count(*) filter(where t.is_first and choice=1),count(*) filter(where t.is_first and choice=2),count(*) filter(where t.is_first and choice=3),count(*) filter(where t.is_first and choice=4)) choices,
   percentile_cont(0.5) within group(order by t.elapsed_ms) filter(where t.is_first and t.elapsed_ms>0) median_ms,
   count(*) filter(where not t.is_first) repeat_count,
   round(100.0*count(*) filter(where not t.is_first and t.correct)/nullif(count(*) filter(where not t.is_first),0),1) repeat_rate
  from trainer_private.catalog c left join public.trainer_attempts t on t.question_id=c.id and t.bank_version=c.bank_version and t.eligible
  where (p_exam is null or c.exam=p_exam) and (p_subject is null or c.subject=p_subject) and (p_year is null or c.year=p_year) and (p_type is null or c.question_type=p_type)
  group by c.id
 ) r;
 return jsonb_build_object('minimum',threshold,'rows',rows,'generatedAt',clock_timestamp());
end $$;
create or replace function trainer_private.admin_minimum(p_minimum integer) returns integer
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user();
begin
 if not exists(select 1 from trainer_private.admins where user_id=u) then raise exception '관리자만 변경할 수 있습니다.' using errcode='42501'; end if;
 if p_minimum not between 5 and 10000 then raise exception '최소 응답자 수는 5~10,000명으로 입력해 주세요.'; end if;
 update trainer_private.settings set min_sample=p_minimum where id;return p_minimum;
end $$;
create or replace function trainer_private.account_info() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=trainer_private.require_user();
begin return jsonb_build_object('isAdmin',exists(select 1 from trainer_private.admins where user_id=u)); end $$;

create or replace function public.trainer_put_item(p_operation uuid,p_key text,p_expected bigint,p_body jsonb) returns jsonb language sql security invoker set search_path='' as $$select trainer_private.put_item(p_operation,p_key,p_expected,p_body)$$;
create or replace function public.trainer_submit_attempts(p_session text,p_answers jsonb,p_online boolean,p_reveal boolean) returns jsonb language sql security invoker set search_path='' as $$select trainer_private.submit_attempts(p_session,p_answers,p_online,p_reveal)$$;
create or replace function public.trainer_mark_seen(p_ids text[]) returns void language sql security invoker set search_path='' as $$select trainer_private.mark_seen(p_ids)$$;
create or replace function public.trainer_import_records(p_records jsonb) returns integer language sql security invoker set search_path='' as $$select trainer_private.import_records(p_records)$$;
create or replace function public.trainer_progress() returns jsonb language sql security invoker set search_path='' as $$select trainer_private.progress()$$;
create or replace function public.trainer_admin_stats(p_exam text default null,p_subject text default null,p_year integer default null,p_type text default null) returns jsonb language sql security invoker set search_path='' as $$select trainer_private.admin_stats(p_exam,p_subject,p_year,p_type)$$;
create or replace function public.trainer_admin_minimum(p_minimum integer) returns integer language sql security invoker set search_path='' as $$select trainer_private.admin_minimum(p_minimum)$$;
create or replace function public.trainer_account_info() returns jsonb language sql security invoker set search_path='' as $$select trainer_private.account_info()$$;
-- Exact function permissions are applied together with the schema, before commit.
do $$declare f record;begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='trainer_private' or (n.nspname='public' and p.proname like 'trainer\_%' escape '\') loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
