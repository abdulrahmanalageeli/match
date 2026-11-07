-- Mutual consent now inserts two choices in one statement. A row trigger sees
-- both rows on each invocation and double-counts that single agreement.
drop trigger pilot_steps on marriage.stage_choices;
create function marriage.pilot_step_events() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into marriage.pilot_counts(day,event,total)
 select (now() at time zone 'Asia/Riyadh')::date,
   case choices.stage when 1 then 'serious_discussion_agreed' else 'formal_step_agreed' end,
   count(*)
 from (select distinct request_id,stage from new_stage_choices) choices
 where (select count(*) from marriage.stage_choices current_choices
   where current_choices.request_id=choices.request_id and current_choices.stage=choices.stage)=2
 group by choices.stage
 on conflict(day,event) do update set total=marriage.pilot_counts.total+excluded.total;
 return null;
end $$;
revoke all on function marriage.pilot_step_events() from public,anon,authenticated;
create trigger pilot_steps after insert on marriage.stage_choices
 referencing new table as new_stage_choices for each statement
 execute function marriage.pilot_step_events();
