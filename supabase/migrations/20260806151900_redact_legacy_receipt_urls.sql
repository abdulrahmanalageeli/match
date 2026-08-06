-- One historical receipt had no recoverable storage_path. The private bucket
-- blocks access, but retaining the obsolete public locator is unnecessary.
update public.participant_receipts
set receipt_url = 'redacted'
where receipt_url like 'http%';

update public.participants
set receipt_url = null
where receipt_url like 'http%';
