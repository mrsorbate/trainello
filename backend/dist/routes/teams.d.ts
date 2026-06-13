declare const router: import("express-serve-static-core").Router;
export declare const runTeamGameImport: (teamId: number, createdByUserId: number) => Promise<{
    success: boolean;
    imported: number;
    updated: number;
    skipped: number;
    created: never[];
    updatedItems: never[];
    skippedDetails: never[];
    mode: string;
    message: string;
    skipped_existing?: undefined;
    skipped_past_without_result?: undefined;
    source_ids?: undefined;
} | {
    success: boolean;
    imported: number;
    updated: number;
    skipped: number;
    created: string[];
    updatedItems: string[];
    skippedDetails: string[];
    skipped_existing: number;
    skipped_past_without_result: number;
    mode: string;
    source_ids: string[];
    message?: undefined;
}>;
export default router;
//# sourceMappingURL=teams.d.ts.map