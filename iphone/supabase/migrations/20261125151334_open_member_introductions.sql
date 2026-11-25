-- Saved partner preferences inform the compatibility reading. Contact eligibility
-- is checked by compatible(), including account status and private boundaries.
create or replace function marriage.new_pair_requirements(a uuid, b uuid)
returns boolean language sql stable set search_path='' as $$
  select exists (
    select 1 from marriage.profiles p join marriage.profiles q on q.member_id=b
    where p.member_id=a and p.gender<>q.gender
      and p.age between 18 and 110 and q.age between 18 and 110
  )
$$;
