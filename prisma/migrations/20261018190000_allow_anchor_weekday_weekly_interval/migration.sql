-- WEEKLY_INTERVAL rules may omit weekdays; in that case the anchorDate weekday is used.
-- This aligns the database constraint with the approved recurrence evaluator contract.
ALTER TABLE schedule_rule DROP CONSTRAINT IF EXISTS rule_shape_valid;
ALTER TABLE schedule_rule
  ADD CONSTRAINT rule_shape_valid CHECK (
    (recurrence_type = 'DAILY' AND cardinality(weekdays) = 0 AND interval_weeks = 1)
    OR (recurrence_type = 'SELECTED_WEEKDAYS' AND cardinality(weekdays) BETWEEN 1 AND 7 AND interval_weeks = 1)
    OR (recurrence_type = 'WEEKLY_INTERVAL' AND cardinality(weekdays) BETWEEN 0 AND 7)
  );
