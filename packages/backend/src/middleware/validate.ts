import type { Request, Response, NextFunction } from "express";
import { z, type ZodSchema } from "zod";

/**
 * Request validation middleware factory.
 * Validates req.body against a Zod schema and returns standardized errors.
 */

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({
        error: "Validation failed",
        details: result.error.issues.map(i => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

// ──── Common Schemas ──────────────────────────────────────

export const PactProposalSchema = z.object({
  counterparty: z.string().startsWith("0x").length(42),
  description: z.string().min(10).max(2000).optional(),
  amount: z.string().optional(),
  duration: z.number().int().positive().optional(),
  collateralRatio: z.number().int().min(10000).max(50000).optional(),
  interestRate: z.number().int().min(0).max(5000).optional(),
});

export const NegotiationSchema = z.object({
  pactId: z.string().startsWith("0x").length(66),
  terms: z.object({
    amount: z.string(),
    duration: z.number().int().positive(),
    collateralRatio: z.number().int().min(10000).max(50000),
    interestRate: z.number().int().min(0).max(5000),
  }).optional(),
});

export const AgentRegisterSchema = z.object({
  name: z.string().min(1).max(100),
  capabilities: z.array(z.string().max(50)).max(20),
  metadataUri: z.string().max(200).optional(),
});

export const MediationSchema = z.object({
  pactId: z.string().startsWith("0x").length(66),
  evidence: z.object({
    breachDetails: z.object({
      tier: z.string(),
      conditionBitmap: z.string(),
      failedConditions: z.array(z.string()),
      degradationCount: z.number().int(),
    }),
    attestationHistory: z.array(z.object({
      cycle: z.number().int(),
      bitmap: z.string(),
      state: z.string(),
      timestamp: z.number(),
    })),
    marketContext: z.string(),
    partyAPosition: z.string().max(1000),
    partyBPosition: z.string().max(1000),
  }),
});
