import { z } from 'zod';
export declare const createUserSchema: z.ZodObject<{
    username: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["admin", "trainer", "player"]>>;
}, "strip", z.ZodTypeAny, {
    username: string;
    email: string;
    role: "admin" | "trainer" | "player";
    password: string;
    name: string;
}, {
    username: string;
    email: string;
    password: string;
    name: string;
    role?: "admin" | "trainer" | "player" | undefined;
}>;
export declare const createTeamSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
}>;
export declare const createEventSchema: z.ZodObject<{
    team_id: z.ZodNumber;
    title: z.ZodString;
    type: z.ZodEnum<["training", "match", "other"]>;
    description: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodString>;
    start_time: z.ZodString;
    end_time: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "training" | "match" | "other";
    team_id: number;
    title: string;
    start_time: string;
    end_time: string;
    description?: string | undefined;
    location?: string | undefined;
}, {
    type: "training" | "match" | "other";
    team_id: number;
    title: string;
    start_time: string;
    end_time: string;
    description?: string | undefined;
    location?: string | undefined;
}>;
export declare const updateEventResponseSchema: z.ZodObject<{
    status: z.ZodEnum<["accepted", "declined", "tentative", "pending"]>;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "accepted" | "declined" | "tentative" | "pending";
    comment?: string | undefined;
}, {
    status: "accepted" | "declined" | "tentative" | "pending";
    comment?: string | undefined;
}>;
//# sourceMappingURL=validation.d.ts.map