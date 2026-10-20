-- A cancelled plan is excluded from normal historical analytics and can be replaced.
ALTER TYPE "PlanStatus" ADD VALUE 'CANCELLED';
