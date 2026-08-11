-- An approved receipt is the authoritative evidence that payment was completed
-- for that receipt's event. Restrict the repair to each match's active event so
-- historical approvals cannot carry payment eligibility into a later event.
with approved_current_event_receipts as (
  select distinct
    participant.id as participant_id,
    state.current_event_id
  from public.participants as participant
  join public.event_state as state
    on state.match_id = participant.match_id
  join public.participant_receipts as receipt
    on receipt.participant_id = participant.id
   and receipt.event_id = state.current_event_id
   and receipt.status = 'approved'
  where state.current_event_id is not null
)
update public.participants as participant
set "PAID_DONE" = true,
    payment_completed_event_id = approved_receipt.current_event_id,
    payment_waived = false,
    payment_waived_event_id = null
from approved_current_event_receipts as approved_receipt
where participant.id = approved_receipt.participant_id
  and (
    participant."PAID_DONE" is distinct from true
    or participant.payment_completed_event_id is distinct from approved_receipt.current_event_id
    or participant.payment_waived is distinct from false
    or participant.payment_waived_event_id is not null
  );
