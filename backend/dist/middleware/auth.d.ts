import { Request, Response, NextFunction } from 'express';
export interface JWTPayload {
    id: number;
    username: string;
    email: string;
    role: string;
}
export interface AuthRequest extends Request {
    user?: {
        id: number;
        username: string;
        email: string;
        role: string;
    };
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
export declare const authorize: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map