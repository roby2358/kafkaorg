import { z } from 'zod';

export const signInRequestSchema = z.object({
  username: z.string().min(1),
});

export const signUpRequestSchema = z.object({
  username: z.string().min(1),
  name: z.string().min(1),
});

export type SignInRequest = z.infer<typeof signInRequestSchema>;
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;
