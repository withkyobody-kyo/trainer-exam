-- Run after the owner completes signup and email confirmation.
-- Only this verified Auth user receives the server-managed admin role.
do $$
declare owner_id uuid;
begin
 select id into owner_id from auth.users where lower(email)='withkyobody@gmail.com' and email_confirmed_at is not null and coalesce(is_anonymous,false)=false;
 if owner_id is null then raise exception 'withkyobody@gmail.com 계정의 회원가입과 이메일 인증을 먼저 완료해 주세요.'; end if;
 insert into trainer_private.admins(user_id) values(owner_id) on conflict do nothing;
end $$;
