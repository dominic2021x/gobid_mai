/**
 * Search orchestrator output: strict schema for OpenAI Structured Outputs.
 * Used by POST /api/ai/search-orchestrator. UI consumes normalizedQuery, proposedFilters, steps.
 */

import { z } from "zod";

/** Relaxation step: id + reason + full querystring for /api/ro/listings */
export const OrchestratorStepSchema = z.object({
  id: z.enum(["strict", "no-city", "no-color", "short-q", "no-county", "wider-category"]),
  reason: z.string().describe("Short human-readable reason for this step"),
  listingsQuery: z.string().describe("Full query string for /api/ro/listings, e.g. 'q=audi+a4&county=Cluj&from=0&limit=30'"),
});

/** Proposed filters to apply in URL (only known facets; no invented values). */
export const ProposedFiltersSchema = z.object({
  category: z.string().optional(),
  subcategory: z.string().optional(),
  county: z.string().optional(),
  city: z.string().optional(),
  location: z.string().optional(),
  brand: z.string().optional(),
  color: z.string().optional(),
  condition: z.string().optional(),
  priceMin: z.number().optional(),
  priceMax: z.number().optional(),
  sort: z.string().optional(),
});

/** Full plan returned by the orchestrator. */
export const SearchOrchestratorPlanSchema = z.object({
  normalizedQuery: z.string().describe("Normalized search query, trimmed and cleaned"),
  proposedFilters: ProposedFiltersSchema.describe("Filters to apply in URL; only use values that exist in the system"),
  steps: z.array(OrchestratorStepSchema).min(1).describe("Ordered relaxation steps; step0 = strict, each has full listingsQuery"),
  uiHints: z.object({
    showRelaxNotice: z.boolean(),
    noticeText: z.string().optional(),
  }),
});

export type OrchestratorStep = z.infer<typeof OrchestratorStepSchema>;
export type ProposedFilters = z.infer<typeof ProposedFiltersSchema>;
export type SearchOrchestratorPlan = z.infer<typeof SearchOrchestratorPlanSchema>;

/**
 * OpenAI Structured Outputs expect a specific JSON Schema format (strict mode).
 * We define the schema manually so it matches OpenAI's requirements (no additionalProperties
 * at root, explicit types, etc.).
 */
export const orchestratorJsonSchema = {
  name: "SearchOrchestratorPlan",
  strict: true,
  schema: {
    type: "object",
    properties: {
      normalizedQuery: { type: "string", description: "Normalized search query, trimmed and cleaned" },
      proposedFilters: {
        type: "object",
        properties: {
          category: { type: "string" },
          subcategory: { type: "string" },
          county: { type: "string" },
          city: { type: "string" },
          location: { type: "string" },
          brand: { type: "string" },
          color: { type: "string" },
          condition: { type: "string" },
          priceMin: { type: "number" },
          priceMax: { type: "number" },
          sort: { type: "string" },
        },
        additionalProperties: false,
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              enum: ["strict", "no-city", "no-color", "short-q", "no-county", "wider-category"],
            },
            reason: { type: "string" },
            listingsQuery: { type: "string" },
          },
          required: ["id", "reason", "listingsQuery"],
          additionalProperties: false,
        },
        minItems: 1,
      },
      uiHints: {
        type: "object",
        properties: {
          showRelaxNotice: { type: "boolean" },
          noticeText: { type: "string" },
        },
        required: ["showRelaxNotice"],
        additionalProperties: false,
      },
    },
    required: ["normalizedQuery", "proposedFilters", "steps", "uiHints"],
    additionalProperties: false,
  } as const,
};
