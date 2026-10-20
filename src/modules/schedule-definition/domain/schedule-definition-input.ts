import { z } from "zod";

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");

const localTimeSchema = z.string().regex(
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,3})?)?$/,
  "Time must use 24-hour HH:mm[:ss[.fff]] format",
);

function timeToMicroseconds(value: string): number {
  const [whole, fraction = ""] = value.split(".");
  const parts = whole.split(":").map(Number);
  const [hours, minutes, seconds = 0] = parts;
  return (((hours * 60 + minutes) * 60 + seconds) * 1_000_000) + Number(fraction.padEnd(6, "0") || "0");
}

const recurrenceRuleObject = z.object({
  recurrenceType: z.enum(["DAILY", "SELECTED_WEEKDAYS", "WEEKLY_INTERVAL"]),
  intervalWeeks: z.number().int().min(1).max(520).default(1),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  effectiveStartDate: dateOnlySchema,
  effectiveEndDate: dateOnlySchema.nullable().optional().default(null),
  anchorDate: dateOnlySchema,
  isEnabled: z.boolean().default(true),
});

const recurrenceRuleSchema = recurrenceRuleObject.superRefine((rule, context) => {
  if (rule.effectiveEndDate && rule.effectiveEndDate < rule.effectiveStartDate) {
    context.addIssue({ code: "custom", path: ["effectiveEndDate"], message: "effectiveEndDate must be on or after effectiveStartDate" });
  }
  if (rule.anchorDate < rule.effectiveStartDate) {
    context.addIssue({ code: "custom", path: ["anchorDate"], message: "anchorDate must be on or after effectiveStartDate" });
  }
  if (new Set(rule.weekdays).size !== rule.weekdays.length) {
    context.addIssue({ code: "custom", path: ["weekdays"], message: "weekdays must not contain duplicates" });
  }
  if (rule.recurrenceType === "DAILY" && (rule.weekdays.length !== 0 || rule.intervalWeeks !== 1)) {
    context.addIssue({ code: "custom", message: "DAILY rules require no weekdays and intervalWeeks = 1" });
  }
  if (rule.recurrenceType === "SELECTED_WEEKDAYS" && (rule.weekdays.length === 0 || rule.intervalWeeks !== 1)) {
    context.addIssue({ code: "custom", message: "SELECTED_WEEKDAYS requires weekdays and intervalWeeks = 1" });
  }
});

const scheduleFieldsObject = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).nullable().optional().transform((value) => value || null),
  categoryId: z.string().uuid().nullable().optional().transform((value) => value || null),
  timeMode: z.enum(["TIMED", "UNTIMED"]),
  startTime: localTimeSchema.nullable().optional().transform((value) => value || null),
  endTime: localTimeSchema.nullable().optional().transform((value) => value || null),
  isEnabled: z.boolean().default(true),
});

export const validateScheduleDefinitionFieldsSchema = scheduleFieldsObject.superRefine((value, context) => {
  if (value.timeMode === "TIMED") {
    if (!value.startTime) context.addIssue({ code: "custom", path: ["startTime"], message: "Timed schedules require startTime" });
    if (!value.endTime) context.addIssue({ code: "custom", path: ["endTime"], message: "Timed schedules require endTime" });
    if (value.startTime && value.endTime && timeToMicroseconds(value.endTime) <= timeToMicroseconds(value.startTime)) {
      context.addIssue({ code: "custom", path: ["endTime"], message: "endTime must be after startTime" });
    }
  } else if (value.startTime || value.endTime) {
    context.addIssue({ code: "custom", message: "Untimed schedules must not specify startTime or endTime" });
  }
});

export const createScheduleDefinitionSchema = validateScheduleDefinitionFieldsSchema.safeExtend({
  rules: z.array(recurrenceRuleSchema).min(1).max(100),
});

export const updateScheduleDefinitionSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(4000).nullable().optional().transform((value) => value === "" ? null : value),
  categoryId: z.string().uuid().nullable().optional(),
  timeMode: z.enum(["TIMED", "UNTIMED"]).optional(),
  startTime: localTimeSchema.nullable().optional(),
  endTime: localTimeSchema.nullable().optional(),
  isEnabled: z.boolean().optional(),
}).refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  "At least one field must be supplied",
);

export const createScheduleRuleSchema = recurrenceRuleSchema;
export const updateScheduleRuleSchema = z.object({
  recurrenceType: z.enum(["DAILY", "SELECTED_WEEKDAYS", "WEEKLY_INTERVAL"]).optional(),
  intervalWeeks: z.number().int().min(1).max(520).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  effectiveStartDate: dateOnlySchema.optional(),
  effectiveEndDate: dateOnlySchema.nullable().optional(),
  anchorDate: dateOnlySchema.optional(),
  isEnabled: z.boolean().optional(),
}).refine(
  (value) => Object.values(value).some((field) => field !== undefined),
  "At least one field must be supplied",
);

export type CreateScheduleDefinitionInput = z.infer<typeof createScheduleDefinitionSchema>;
export type UpdateScheduleDefinitionInput = z.infer<typeof updateScheduleDefinitionSchema>;
export type ScheduleRuleInput = z.infer<typeof recurrenceRuleSchema>;
export type UpdateScheduleRuleInput = z.infer<typeof updateScheduleRuleSchema>;
