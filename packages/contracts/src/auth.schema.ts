import { z } from 'zod';
import { backupEnvelopeSchema } from './portability.schema';

export const authUserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

export const registerInputSchema = z.object({
  name: z.string().trim().min(1, 'Full name is required').max(80),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long.')
    .max(128),
  initialBackup: backupEnvelopeSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerInputSchema>;

export const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().email('Please enter a valid email address.'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters long.')
    .max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const authSessionResponseSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.string().datetime(),
  user: authUserSchema,
});
export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const meResponseSchema = z.object({
  user: authUserSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const logoutResponseSchema = z.object({
  success: z.literal(true),
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;
