create table if not exists public.apple_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id text not null unique,
  original_transaction_id text null,
  product_id text not null,
  product_kind text not null,
  credited_amount integer not null check (credited_amount > 0),
  environment text not null,
  raw_response jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_apple_transactions_user_created
  on public.apple_transactions (user_id, created_at desc);

create index if not exists idx_apple_transactions_product_id
  on public.apple_transactions (product_id);

create index if not exists idx_apple_transactions_original_tx
  on public.apple_transactions (original_transaction_id);

create or replace function public.apply_apple_credit_topup(
  p_user_id uuid,
  p_transaction_id text,
  p_original_transaction_id text,
  p_product_id text,
  p_product_kind text,
  p_credited_amount integer,
  p_environment text,
  p_raw_response jsonb
)
returns table (
  applied boolean,
  transaction_id text,
  credited_amount integer
)
language plpgsql
security definer
as $$
declare
  inserted_tx_id text;
begin
  if p_credited_amount is null or p_credited_amount <= 0 then
    raise exception 'credited_amount must be > 0';
  end if;

  begin
    insert into public.apple_transactions (
      user_id,
      transaction_id,
      original_transaction_id,
      product_id,
      product_kind,
      credited_amount,
      environment,
      raw_response
    )
    values (
      p_user_id,
      p_transaction_id,
      p_original_transaction_id,
      p_product_id,
      p_product_kind,
      p_credited_amount,
      p_environment,
      p_raw_response
    )
    returning apple_transactions.transaction_id into inserted_tx_id;
  exception
    when unique_violation then
      return query
      select false, p_transaction_id, 0;
      return;
  end;

  insert into public.user_payments (
    user_id,
    amount,
    currency,
    payment_type,
    description,
    metadata
  )
  values (
    p_user_id,
    p_credited_amount,
    'RON',
    'credit_purchase',
    format('Apple IAP credit bundle (%s credite)', p_credited_amount),
    jsonb_build_object(
      'payment_method', 'apple_iap',
      'product_id', p_product_id,
      'transaction_id', p_transaction_id,
      'original_transaction_id', p_original_transaction_id,
      'environment', p_environment
    )
  );

  return query
  select true, inserted_tx_id, p_credited_amount;
end;
$$;

grant execute on function public.apply_apple_credit_topup(
  uuid,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb
) to service_role;
