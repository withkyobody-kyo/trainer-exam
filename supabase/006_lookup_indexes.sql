begin;
create index if not exists trainer_exposures_question on trainer_private.exposures(question_id);
create index if not exists trainer_first_response_question on trainer_private.first_responses(question_id);
create index if not exists trainer_first_response_attempt on trainer_private.first_responses(attempt_id);
create index if not exists trainer_legacy_question on trainer_private.legacy_records(question_id);
commit;
