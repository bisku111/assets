-- =====================================================================
-- 0001 — Estensioni, funzioni di utilita' e tipi enumerati
-- =====================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "pg_trgm";       -- ricerca testuale nel catalogo

-- Aggiorna updated_at ad ogni UPDATE. Usata da piu' tabelle.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Gli enum rendono impossibile scrivere stati inventati.
do $$ begin create type public.skill_level as enum ('never_played','beginner','plays_already','advanced');
exception when duplicate_object then null; end $$;

do $$ begin create type public.difficulty_key as enum ('beginner','easy','intermediate','advanced','complete');
exception when duplicate_object then null; end $$;

do $$ begin create type public.hand as enum ('left','right');
exception when duplicate_object then null; end $$;

do $$ begin create type public.section_kind as enum ('intro','verse','chorus','bridge','solo','outro','exercise');
exception when duplicate_object then null; end $$;

do $$ begin create type public.practice_mode as enum ('learn','practice','play','performance');
exception when duplicate_object then null; end $$;

do $$ begin create type public.input_source as enum ('midi','microphone','virtual_keyboard');
exception when duplicate_object then null; end $$;

-- Stato della licenza. Solo 'original', 'public_domain' e 'cleared'
-- rendono un brano servibile.
do $$ begin create type public.license_status as enum ('original','public_domain','cleared','pending','expired','blocked');
exception when duplicate_object then null; end $$;

do $$ begin create type public.subscription_status as enum ('trialing','active','past_due','canceled','expired');
exception when duplicate_object then null; end $$;

do $$ begin create type public.subscription_plan as enum ('free','premium_monthly','premium_yearly');
exception when duplicate_object then null; end $$;

do $$ begin create type public.payment_status as enum ('pending','succeeded','failed','refunded');
exception when duplicate_object then null; end $$;
