import { z } from 'zod';

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const registerInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(128),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const authResponseSchema = z.object({
  token: z.string().min(1),
  user: authUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const authMeResponseSchema = z.object({
  user: authUserSchema,
});
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;
