-- Activated plans retain activated_at after becoming inactive/cancelled. Expired drafts
-- may become inactive without ever being activated, so only ACTIVE requires a timestamp.
ALTER TABLE daily_plan DROP CONSTRAINT IF EXISTS daily_plan_activation_consistent;
ALTER TABLE daily_plan
  ADD CONSTRAINT daily_plan_activation_consistent
  CHECK (status <> 'ACTIVE' OR activated_at IS NOT NULL);
