import { Prisma, type PrismaClient } from "@prisma/client";
import {
  createScheduleDefinitionSchema,
  createScheduleRuleSchema,
  updateScheduleDefinitionSchema,
  updateScheduleRuleSchema,
  validateScheduleDefinitionFieldsSchema,
  type ScheduleRuleInput,
} from "../domain/schedule-definition-input";

export class ScheduleDefinitionNotFoundError extends Error {
  constructor() {
    super("Schedule definition or rule was not found");
    this.name = "ScheduleDefinitionNotFoundError";
  }
}

export class ScheduleCategoryNotFoundError extends Error {
  constructor() {
    super("Category was not found for this user or is archived");
    this.name = "ScheduleCategoryNotFoundError";
  }
}

export class ScheduleRuleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleRuleConflictError";
  }
}

type Database = PrismaClient;

function dateOnlyToUtcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function localTimeToDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [whole, fraction = ""] = value.split(".");
  const [hours, minutes, seconds = 0] = whole.split(":").map(Number);
  const milliseconds = Number(fraction.padEnd(6, "0").slice(0, 3) || "0");
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, seconds, milliseconds));
}

function timeDateToString(value: Date | null): string | null {
  if (!value) return null;
  const base = [value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
  const milliseconds = value.getUTCMilliseconds();
  return milliseconds === 0 ? base : `${base}.${String(milliseconds).padStart(3, "0")}`;
}

function ruleCreateData(rule: ScheduleRuleInput) {
  return {
    recurrenceType: rule.recurrenceType,
    intervalWeeks: rule.intervalWeeks,
    weekdays: rule.weekdays,
    effectiveStartDate: dateOnlyToUtcDate(rule.effectiveStartDate),
    effectiveEndDate: rule.effectiveEndDate ? dateOnlyToUtcDate(rule.effectiveEndDate) : null,
    anchorDate: dateOnlyToUtcDate(rule.anchorDate),
    isEnabled: rule.isEnabled,
  };
}

export class ScheduleDefinitionService {
  constructor(private readonly db: Database) {}

  async create(userId: string, untrustedInput: unknown) {
    const input = createScheduleDefinitionSchema.parse(untrustedInput);
    await this.assertCategoryBelongsToUser(userId, input.categoryId);

    const created = await this.db.scheduleDefinition.create({
      data: {
        userId,
        title: input.title,
        description: input.description,
        categoryId: input.categoryId,
        timeMode: input.timeMode,
        startTime: localTimeToDate(input.startTime),
        endTime: localTimeToDate(input.endTime),
        isEnabled: input.isEnabled,
        rules: { create: input.rules.map(ruleCreateData) },
      },
      include: { rules: true, category: true },
    });
    return this.serializeDefinition(created);
  }

  async list(userId: string, includeArchived = false) {
    const definitions = await this.db.scheduleDefinition.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: { rules: { orderBy: { createdAt: "asc" } }, category: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    });
    return definitions.map((definition) => this.serializeDefinition(definition));
  }

  async getById(userId: string, definitionId: string) {
    const definition = await this.db.scheduleDefinition.findFirst({
      where: { id: definitionId, userId, archivedAt: null },
      include: { rules: { orderBy: { createdAt: "asc" } }, category: true },
    });
    if (!definition) throw new ScheduleDefinitionNotFoundError();
    return this.serializeDefinition(definition);
  }

  async update(userId: string, definitionId: string, untrustedInput: unknown) {
    const input = updateScheduleDefinitionSchema.parse(untrustedInput);
    const existing = await this.db.scheduleDefinition.findFirst({ where: { id: definitionId, userId, archivedAt: null } });
    if (!existing) throw new ScheduleDefinitionNotFoundError();
    if (input.categoryId !== undefined) await this.assertCategoryBelongsToUser(userId, input.categoryId);

    const switchingToUntimed = input.timeMode === "UNTIMED" && input.startTime === undefined && input.endTime === undefined;
    const mergedFields = validateScheduleDefinitionFieldsSchema.parse({
      title: input.title ?? existing.title,
      description: input.description !== undefined ? input.description : existing.description,
      categoryId: input.categoryId !== undefined ? input.categoryId : existing.categoryId,
      timeMode: input.timeMode ?? existing.timeMode,
      startTime: switchingToUntimed ? null : input.startTime !== undefined ? input.startTime : timeDateToString(existing.startTime),
      endTime: switchingToUntimed ? null : input.endTime !== undefined ? input.endTime : timeDateToString(existing.endTime),
      isEnabled: input.isEnabled ?? existing.isEnabled,
    });
    await this.assertCategoryBelongsToUser(userId, mergedFields.categoryId);

    const updated = await this.db.scheduleDefinition.update({
      where: { id: definitionId },
      data: {
        title: mergedFields.title,
        description: mergedFields.description,
        categoryId: mergedFields.categoryId,
        timeMode: mergedFields.timeMode,
        startTime: localTimeToDate(mergedFields.startTime),
        endTime: localTimeToDate(mergedFields.endTime),
        isEnabled: mergedFields.isEnabled,
      },
      include: { rules: { orderBy: { createdAt: "asc" } }, category: true },
    });
    return this.serializeDefinition(updated);
  }

  async archive(userId: string, definitionId: string) {
    const existing = await this.db.scheduleDefinition.findFirst({ where: { id: definitionId, userId, archivedAt: null } });
    if (!existing) throw new ScheduleDefinitionNotFoundError();
    await this.db.scheduleDefinition.update({
      where: { id: definitionId },
      data: { archivedAt: new Date(), isEnabled: false },
    });
  }

  async createRule(userId: string, definitionId: string, untrustedInput: unknown) {
    const input = createScheduleRuleSchema.parse(untrustedInput);
    const definition = await this.db.scheduleDefinition.findFirst({ where: { id: definitionId, userId, archivedAt: null } });
    if (!definition) throw new ScheduleDefinitionNotFoundError();
    return this.db.scheduleRule.create({ data: { scheduleDefinitionId: definitionId, ...ruleCreateData(input) } });
  }

  async updateRule(userId: string, definitionId: string, ruleId: string, untrustedInput: unknown) {
    const input = updateScheduleRuleSchema.parse(untrustedInput);
    const existing = await this.db.scheduleRule.findFirst({
      where: { id: ruleId, scheduleDefinitionId: definitionId, definition: { userId, archivedAt: null } },
    });
    if (!existing) throw new ScheduleDefinitionNotFoundError();

    const merged = {
      recurrenceType: input.recurrenceType ?? existing.recurrenceType,
      intervalWeeks: input.intervalWeeks ?? existing.intervalWeeks,
      weekdays: input.weekdays ?? existing.weekdays,
      effectiveStartDate: input.effectiveStartDate ?? existing.effectiveStartDate.toISOString().slice(0, 10),
      effectiveEndDate: input.effectiveEndDate !== undefined
        ? input.effectiveEndDate
        : existing.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
      anchorDate: input.anchorDate ?? existing.anchorDate.toISOString().slice(0, 10),
      isEnabled: input.isEnabled ?? existing.isEnabled,
    };
    const validated = createScheduleRuleSchema.safeParse(merged);
    if (!validated.success) throw validated.error;
    return this.db.scheduleRule.update({ where: { id: ruleId }, data: ruleCreateData(validated.data) });
  }

  async deleteRule(userId: string, definitionId: string, ruleId: string) {
    const rule = await this.db.scheduleRule.findFirst({
      where: { id: ruleId, scheduleDefinitionId: definitionId, definition: { userId, archivedAt: null } },
    });
    if (!rule) throw new ScheduleDefinitionNotFoundError();
    await this.db.scheduleRule.delete({ where: { id: ruleId } });
  }

  private async assertCategoryBelongsToUser(userId: string, categoryId: string | null | undefined) {
    if (!categoryId) return;
    const category = await this.db.category.findFirst({ where: { id: categoryId, userId, archivedAt: null }, select: { id: true } });
    if (!category) throw new ScheduleCategoryNotFoundError();
  }

  private serializeDefinition<T extends {
    id: string; userId: string; categoryId: string | null; title: string; description: string | null;
    timeMode: string; startTime: Date | null; endTime: Date | null; isEnabled: boolean;
    createdAt: Date; updatedAt: Date; archivedAt: Date | null; category?: { id: string; name: string } | null;
    rules: Array<{ id: string; recurrenceType: string; intervalWeeks: number; weekdays: number[]; effectiveStartDate: Date; effectiveEndDate: Date | null; anchorDate: Date; isEnabled: boolean; createdAt: Date }>;
  }>(definition: T) {
    return {
      id: definition.id,
      userId: definition.userId,
      categoryId: definition.categoryId,
      category: definition.category ? { id: definition.category.id, name: definition.category.name } : null,
      title: definition.title,
      description: definition.description,
      timeMode: definition.timeMode,
      startTime: timeDateToString(definition.startTime),
      endTime: timeDateToString(definition.endTime),
      isEnabled: definition.isEnabled,
      createdAt: definition.createdAt.toISOString(),
      updatedAt: definition.updatedAt.toISOString(),
      archivedAt: definition.archivedAt?.toISOString() ?? null,
      rules: definition.rules.map((rule) => ({
        id: rule.id,
        recurrenceType: rule.recurrenceType,
        intervalWeeks: rule.intervalWeeks,
        weekdays: rule.weekdays,
        effectiveStartDate: rule.effectiveStartDate.toISOString().slice(0, 10),
        effectiveEndDate: rule.effectiveEndDate?.toISOString().slice(0, 10) ?? null,
        anchorDate: rule.anchorDate.toISOString().slice(0, 10),
        isEnabled: rule.isEnabled,
        createdAt: rule.createdAt.toISOString(),
      })),
    };
  }
}

export function isPrismaUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
