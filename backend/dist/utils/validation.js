"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEventResponseSchema = exports.createEventSchema = exports.createTeamSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
exports.createUserSchema = zod_1.z.object({
    username: zod_1.z.string().min(3, 'Benutzername muss mindestens 3 Zeichen lang sein').max(30, 'Benutzername darf maximal 30 Zeichen haben'),
    email: zod_1.z.string().email('Ungültige E-Mail-Adresse'),
    password: zod_1.z.string().min(6, 'Passwort muss mindestens 6 Zeichen lang sein'),
    name: zod_1.z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein'),
    role: zod_1.z.enum(['admin', 'trainer', 'player']).default('player'),
});
exports.createTeamSchema = zod_1.z.object({
    name: zod_1.z.string().min(3, 'Team-Name muss mindestens 3 Zeichen lang sein'),
    description: zod_1.z.string().optional(),
});
exports.createEventSchema = zod_1.z.object({
    team_id: zod_1.z.number().positive(),
    title: zod_1.z.string().min(3, 'Titel muss mindestens 3 Zeichen lang sein'),
    type: zod_1.z.enum(['training', 'match', 'other']),
    description: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    start_time: zod_1.z.string(),
    end_time: zod_1.z.string(),
});
exports.updateEventResponseSchema = zod_1.z.object({
    status: zod_1.z.enum(['accepted', 'declined', 'tentative', 'pending']),
    comment: zod_1.z.string().optional(),
});
//# sourceMappingURL=validation.js.map