import { z } from "zod";

export const feedbackActions = [
  "keep",
  "try",
  "adopt",
  "dismiss",
  "block",
] as const;

export const feedbackActionSchema = z.enum(feedbackActions);
export type FeedbackAction = (typeof feedbackActions)[number];

export const feedbackInputSchema = z
  .object({
    action: feedbackActionSchema,
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

export type FeedbackInput = z.infer<typeof feedbackInputSchema>;

export interface FeedbackEvent {
  id: number;
  repositoryId: number | null;
  action: FeedbackAction;
  reason: string | null;
  source: string;
  createdAt: string;
}
