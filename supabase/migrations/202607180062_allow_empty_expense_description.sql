-- Candidate 062: allow optional description text; retain NOT NULL and the 2000-character limit.
-- No historical row updates and no function, permission, or workflow changes.
alter table public.finance_expenses
 drop constraint finance_expenses_description_check,
 add constraint finance_expenses_description_check check (length(btrim(description)) <= 2000);
