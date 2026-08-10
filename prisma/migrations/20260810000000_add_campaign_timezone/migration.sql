-- Records the IANA timezone the campaign's start time and call window were
-- entered in. Without it the scheduler compared the user's wall-clock call
-- window against the server process timezone, delaying campaigns by the
-- user's UTC offset.
ALTER TABLE "campaigns" ADD COLUMN "timezone" TEXT;
