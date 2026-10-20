-- Initial PostgreSQL schema for Personal Schedule & Habit Analytics.
-- Keep this migration aligned with docs/database-schema.md and prisma/schema.prisma.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "TimeMode" AS ENUM ('TIMED', 'UNTIMED');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');
CREATE TYPE "OccurrenceStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED', 'CANCELLED');
CREATE TYPE "RecurrenceType" AS ENUM ('DAILY', 'SELECTED_WEEKDAYS', 'WEEKLY_INTERVAL');

CREATE TABLE app_user (
  id UUID PRIMARY KEY,
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT app_user_timezone_nonempty CHECK (length(trim(timezone)) > 0)
);

CREATE TABLE category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ(6),
  CONSTRAINT category_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT category_user_id_id_unique UNIQUE (user_id, id)
);

CREATE TABLE schedule_definition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  category_id UUID REFERENCES category(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  time_mode "TimeMode" NOT NULL,
  start_time TIME(6),
  end_time TIME(6),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ(6),
  CONSTRAINT schedule_title_nonempty CHECK (length(trim(title)) > 0),
  CONSTRAINT schedule_time_mode_valid CHECK (
    (time_mode = 'TIMED' AND start_time IS NOT NULL AND end_time IS NOT NULL AND end_time > start_time)
    OR (time_mode = 'UNTIMED' AND start_time IS NULL AND end_time IS NULL)
  ),
  CONSTRAINT schedule_user_id_id_unique UNIQUE (user_id, id)
);

CREATE TABLE schedule_rule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_definition_id UUID NOT NULL REFERENCES schedule_definition(id) ON DELETE CASCADE,
  recurrence_type "RecurrenceType" NOT NULL,
  interval_weeks INTEGER NOT NULL DEFAULT 1,
  weekdays SMALLINT[] NOT NULL DEFAULT '{}',
  effective_start_date DATE NOT NULL,
  effective_end_date DATE,
  anchor_date DATE NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT rule_interval_valid CHECK (interval_weeks >= 1),
  CONSTRAINT rule_date_range_valid CHECK (effective_end_date IS NULL OR effective_end_date >= effective_start_date),
  CONSTRAINT rule_anchor_not_before_start CHECK (anchor_date >= effective_start_date),
  CONSTRAINT rule_weekdays_valid CHECK (
    weekdays <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[] AND cardinality(weekdays) <= 7
  ),
  CONSTRAINT rule_shape_valid CHECK (
    (recurrence_type = 'DAILY' AND cardinality(weekdays) = 0 AND interval_weeks = 1)
    OR (recurrence_type = 'SELECTED_WEEKDAYS' AND cardinality(weekdays) BETWEEN 1 AND 7 AND interval_weeks = 1)
    OR (recurrence_type = 'WEEKLY_INTERVAL' AND cardinality(weekdays) BETWEEN 1 AND 7)
  )
);

CREATE TABLE daily_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  status "PlanStatus" NOT NULL DEFAULT 'DRAFT',
  activated_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT daily_plan_user_id_id_unique UNIQUE (user_id, id),
  CONSTRAINT daily_plan_activation_consistent CHECK (
    (status = 'ACTIVE' AND activated_at IS NOT NULL)
    OR (status <> 'ACTIVE' AND activated_at IS NULL)
  )
);

CREATE TABLE activity_occurrence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_plan_id UUID NOT NULL REFERENCES daily_plan(id) ON DELETE CASCADE,
  schedule_definition_id UUID REFERENCES schedule_definition(id) ON DELETE SET NULL,
  schedule_rule_id UUID REFERENCES schedule_rule(id) ON DELETE SET NULL,
  generation_key TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  title_snapshot TEXT NOT NULL,
  category_name_snapshot TEXT,
  time_mode "TimeMode" NOT NULL,
  planned_start_local TIME(6),
  planned_end_local TIME(6),
  timezone_snapshot TEXT NOT NULL,
  status "OccurrenceStatus" NOT NULL DEFAULT 'PENDING',
  actual_duration_minutes INTEGER,
  completed_at TIMESTAMPTZ(6),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT occurrence_title_nonempty CHECK (length(trim(title_snapshot)) > 0),
  CONSTRAINT occurrence_duration_nonnegative CHECK (actual_duration_minutes IS NULL OR actual_duration_minutes >= 0),
  CONSTRAINT occurrence_time_mode_valid CHECK (
    (time_mode = 'TIMED' AND planned_start_local IS NOT NULL AND planned_end_local IS NOT NULL AND planned_end_local > planned_start_local)
    OR (time_mode = 'UNTIMED' AND planned_start_local IS NULL AND planned_end_local IS NULL)
  ),
  CONSTRAINT occurrence_completed_at_consistent CHECK (
    (status = 'COMPLETED' AND completed_at IS NOT NULL)
    OR (status <> 'COMPLETED' AND completed_at IS NULL)
  ),
  CONSTRAINT occurrence_timezone_nonempty CHECK (length(trim(timezone_snapshot)) > 0)
);

CREATE UNIQUE INDEX daily_plan_one_active_per_date
  ON daily_plan (user_id, plan_date) WHERE status = 'ACTIVE';
CREATE INDEX daily_plan_user_date_idx ON daily_plan (user_id, plan_date DESC);
CREATE INDEX occurrence_plan_status_idx ON activity_occurrence (daily_plan_id, status);
CREATE INDEX occurrence_definition_idx ON activity_occurrence (schedule_definition_id);
CREATE UNIQUE INDEX occurrence_generation_key_unique
  ON activity_occurrence (daily_plan_id, generation_key) WHERE generation_key IS NOT NULL;
CREATE INDEX schedule_user_enabled_updated_idx
  ON schedule_definition (user_id, is_enabled, updated_at DESC) WHERE archived_at IS NULL;
CREATE INDEX schedule_rule_definition_enabled_idx ON schedule_rule (schedule_definition_id, is_enabled);
