-- Onboarding happens once, when a retention deal is new. After that the deal is
-- Active, and a renewal returns it to Active, never to Onboarding.

create or replace function deals_onboarding_once() returns trigger
language plpgsql as $$
begin
  if new.category = 'retention'
     and new.stage = 'onboarding'
     and old.stage is distinct from 'onboarding' then
    raise exception 'Onboarding is only for a new retention deal; this one has already left it'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger deals_onboarding_once_trg before update on deals
  for each row execute function deals_onboarding_once();
