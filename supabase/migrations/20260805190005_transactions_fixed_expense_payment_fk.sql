alter table public.transactions
  add constraint transactions_fixed_expense_payment_id_fkey
  foreign key (fixed_expense_payment_id)
  references public.fixed_expense_payments (id)
  on delete set null;
