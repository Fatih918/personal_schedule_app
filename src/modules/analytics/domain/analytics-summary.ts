export type AnalyticsPeriod = "week" | "month";
export type AnalyticsOccurrenceStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "CANCELLED";

export interface AnalyticsPlanInput {
  planDate: Date;
  occurrences: Array<{ status: AnalyticsOccurrenceStatus }>;
}

export interface AnalyticsDaySummary {
  date: string;
  total: number;
  completed: number;
  skipped: number;
  cancelled: number;
  pending: number;
  completionRate: number | null;
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

function mondayOf(date: string): string {
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

/** Aggregates finalized plans only. The caller is responsible for filtering out the current day. */
export function buildAnalyticsSummary(period: AnalyticsPeriod, today: string, plans: AnalyticsPlanInput[]) {
  const startDate = period === "week" ? mondayOf(today) : `${today.slice(0, 7)}-01`;
  const endDateExclusive = today;
  const byDate = new Map<string, Omit<AnalyticsDaySummary, "date" | "completionRate">>();

  for (let date = startDate; date < endDateExclusive; date = addDays(date, 1)) {
    byDate.set(date, { total: 0, completed: 0, skipped: 0, cancelled: 0, pending: 0 });
  }

  for (const plan of plans) {
    const date = plan.planDate.toISOString().slice(0, 10);
    const daily = byDate.get(date);
    if (!daily) continue;
    for (const occurrence of plan.occurrences) {
      daily.total += 1;
      if (occurrence.status === "COMPLETED") daily.completed += 1;
      else if (occurrence.status === "SKIPPED") daily.skipped += 1;
      else if (occurrence.status === "CANCELLED") daily.cancelled += 1;
      else daily.pending += 1;
    }
  }

  const days: AnalyticsDaySummary[] = Array.from(byDate.entries()).map(([date, values]) => ({
    date,
    ...values,
    completionRate: values.total === 0 ? null : Math.round((values.completed / values.total) * 100),
  }));
  const totals = days.reduce((sum, day) => ({
    total: sum.total + day.total,
    completed: sum.completed + day.completed,
    skipped: sum.skipped + day.skipped,
    cancelled: sum.cancelled + day.cancelled,
    pending: sum.pending + day.pending,
  }), { total: 0, completed: 0, skipped: 0, cancelled: 0, pending: 0 });

  return {
    period,
    startDate,
    endDate: addDays(endDateExclusive, -1),
    asOfDate: today,
    excludesCurrentDay: true as const,
    totals: {
      ...totals,
      completionRate: totals.total === 0 ? null : Math.round((totals.completed / totals.total) * 100),
    },
    days,
  };
}
