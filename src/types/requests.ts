import { z } from 'zod';

export const signInRequestSchema = z.object({
  user_id: z.string().min(1).max(32),
});

export const signUpRequestSchema = z.object({
  user_id: z.string().min(1).max(32),
  name: z.string().min(1),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;
