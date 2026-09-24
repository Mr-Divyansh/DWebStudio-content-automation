/**
 * AUTONOMOUS AGENT — Owner-controlled Pricing Rules
 * ============================================================================
 * Prices are NOT hardcoded in prompts. The owner creates rows here (or via the
 * API/UI) and the agent must stay inside them.
 *
 *  - `minPrice`      absolute floor
 *  - `normalPriceMin/Max` the band the agent normally quotes from
 *  - `maxNegotiation` hard floor the AI may not go below
 *  - `escalationAbove` any quote above this needs the owner
 *
 * `pickQuote()` is deterministic (no AI): it picks a value inside the normal
 * band for a given scope, so the same scope always yields the same quote.
 */

import { prisma } from '../database/client.js';

export type PricingScope = 'STATIC_SITE' | 'MULTI_PAGE' | 'REDESIGN' | 'ECOMMERCE' | 'CUSTOM';

export interface PricingRuleInput {
  service: string;
  currency?: string;
  minPrice: number;
  normalPriceMin: number;
  normalPriceMax: number;
  maxNegotiation: number;
  escalationAbove?: number | null;
  active?: boolean;
  notes?: string | null;
}

/** Validates a rule before it is stored, so a bad bound can never be created. */
export function validatePricingRule(input: PricingRuleInput): { valid: true } | { valid: false; error: string } {
  const values = [input.minPrice, input.normalPriceMin, input.normalPriceMax, input.maxNegotiation];
  if (values.some((v) => !Number.isFinite(v) || v <= 0)) {
    return { valid: false, error: 'All price values must be positive numbers.' };
  }
  if (input.normalPriceMin > input.normalPriceMax) {
    return { valid: false, error: 'normalPriceMin cannot exceed normalPriceMax.' };
  }
  if (input.normalPriceMin < input.minPrice || input.normalPriceMax > input.maxNegotiation) {
    return { valid: false, error: 'Normal price band must sit inside [minPrice, maxNegotiation].' };
  }
  if (input.escalationAbove != null && input.escalationAbove < input.maxNegotiation) {
    return { valid: false, error: 'escalationAbove cannot be lower than maxNegotiation.' };
  }
  return { valid: true };
}

export class PricingService {
  static async listRules() {
    return prisma.pricingRule.findMany({ orderBy: { service: 'asc' } });
  }

  static async upsertRule(input: PricingRuleInput) {
    const check = validatePricingRule(input);
    if (!check.valid) throw new Error(check.error);
    return prisma.pricingRule.upsert({
      where: { service: input.service },
      create: {
        service: input.service,
        currency: input.currency || 'INR',
        minPrice: input.minPrice,
        normalPriceMin: input.normalPriceMin,
        normalPriceMax: input.normalPriceMax,
        maxNegotiation: input.maxNegotiation,
        escalationAbove: input.escalationAbove ?? null,
        active: input.active ?? true,
        notes: input.notes ?? null,
      },
      update: {
        currency: input.currency || 'INR',
        minPrice: input.minPrice,
        normalPriceMin: input.normalPriceMin,
        normalPriceMax: input.normalPriceMax,
        maxNegotiation: input.maxNegotiation,
        escalationAbove: input.escalationAbove ?? null,
        active: input.active ?? true,
        notes: input.notes ?? null,
      },
    });
  }

  static async getRule(service: string) {
    return prisma.pricingRule.findUnique({ where: { service } });
  }

  /**
   * Deterministic quote inside the owner's normal band. `index` (0..1) shifts
   * within the band so different leads are not all quoted the identical number,
   * while remaining fully inside the owner's configured limits.
   */
  static pickQuote(rule: { normalPriceMin: number; normalPriceMax: number }, index: number): number {
    const span = rule.normalPriceMax - rule.normalPriceMin;
    if (span <= 0) return rule.normalPriceMin;
    const ratio = ((Math.abs(index) % 1000) / 1000) * 0.4; // stay in the lower 40% of the band
    const raw = rule.normalPriceMin + span * ratio;
    const step = 500;
    return Math.round(raw / step) * step;
  }
}
