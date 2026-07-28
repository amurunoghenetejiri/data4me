-- Add Paystack Dedicated Virtual Account fields

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS bank_name TEXT,
ADD COLUMN IF NOT EXISTS account_name TEXT,
ADD COLUMN IF NOT EXISTS account_number TEXT,
ADD COLUMN IF NOT EXISTS customer_code TEXT,
ADD COLUMN IF NOT EXISTS dedicated_account_id TEXT,
ADD COLUMN IF NOT EXISTS dedicated_account_assigned BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dedicated_account_number TEXT,
ADD COLUMN IF NOT EXISTS dedicated_bank_name TEXT;
