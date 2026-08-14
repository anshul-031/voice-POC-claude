-- Telephony vendors (Vobiz included) enforce a maximum number of simultaneous
-- calls per account. Without a per-provider cap the campaign runner dialled
-- every pending contact at once, and everything past the vendor's limit was
-- rejected or dropped mid-call.
ALTER TABLE "telephony_providers" ADD COLUMN "concurrencyLimit" INTEGER NOT NULL DEFAULT 3;
