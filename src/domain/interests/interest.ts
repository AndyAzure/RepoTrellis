import { z } from "zod";

export const interestInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1_000).nullable().optional(),
    positiveRules: z.array(z.string().trim().min(1).max(80)).max(20),
    negativeRules: z.array(z.string().trim().min(1).max(80)).max(20),
  })
  .strict();

export type InterestInput = z.infer<typeof interestInputSchema>;

export interface Interest {
  id: number;
  name: string;
  description: string | null;
  positiveRules: string[];
  negativeRules: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
