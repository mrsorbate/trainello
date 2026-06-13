import { z } from 'zod';

export const createUserSchema = z.object({
  username: z.string().min(3, 'Benutzername muss mindestens 3 Zeichen lang sein').max(30, 'Benutzername darf maximal 30 Zeichen haben'),
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen lang sein'),
  name: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein'),
  role: z.enum(['admin', 'trainer', 'player']).default('player'),
});

export const createTeamSchema = z.object({
  name: z.string().min(3, 'Team-Name muss mindestens 3 Zeichen lang sein'),
  description: z.string().optional(),
});

export const createEventSchema = z.object({
  team_id: z.number().positive(),
  title: z.string().min(3, 'Titel muss mindestens 3 Zeichen lang sein'),
  type: z.enum(['training', 'match', 'other']),
  description: z.string().optional(),
  location: z.string().optional(),
  start_time: z.string(),
  end_time: z.string(),
});

export const updateEventResponseSchema = z.object({
  status: z.enum(['accepted', 'declined', 'tentative', 'pending']),
  comment: z.string().optional(),
});
