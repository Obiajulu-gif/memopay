-- MemoPay schema. Run once in the Supabase SQL editor.

create table if not exists merchants (
  address       text primary key,            -- lowercase 0x address
  display_name  text,
  created_at    timestamptz not null default now()
);

create table if not exists invoices (
  id             uuid primary key,
  number         text not null,              -- per-merchant sequence, e.g. INV-0001
  merchant       text not null references merchants(address),
  client_name    text not null,
  currency       text not null check (currency in ('USDC','EURC')),
  amount         bigint not null check (amount > 0),   -- 6-decimal units
  line_items     jsonb not null,             -- [{description, quantity, unit_amount}] unit_amount as string
  due_date       date,
  memo_id        text not null unique,       -- 0x bytes32
  content_hash   text not null,              -- 0x bytes32
  created_block  bigint not null,
  status         text not null default 'open' check (status in ('open','paid','void')),
  paid_tx        text,
  paid_by        text,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (merchant, number)
);

create index if not exists invoices_merchant_idx on invoices (merchant, created_at desc);

create table if not exists payments (
  tx_hash     text primary key,
  invoice_id  uuid not null references invoices(id),
  payer       text not null,
  matched     boolean not null,
  reason      text,                          -- null when matched; else wrong_token | wrong_amount_or_recipient | duplicate | invoice_void
  block       bigint not null,
  created_at  timestamptz not null default now()
);

create index if not exists payments_invoice_idx on payments (invoice_id);

create table if not exists auth_nonces (
  nonce       text primary key,
  expires_at  timestamptz not null
);

-- The app connects with the service connection string; keep tables away from the public PostgREST API.
alter table merchants enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table auth_nonces enable row level security;
