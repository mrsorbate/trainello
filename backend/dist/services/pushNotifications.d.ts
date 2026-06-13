type StoredPushSubscription = {
    id: number;
    user_id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
    expiration_time: number | null;
};
export type PushPayload = {
    title: string;
    body: string;
    url?: string;
};
export declare const getStoredSubscriptionsForUsers: (userIds: number[]) => StoredPushSubscription[];
export declare function sendPushToSubscriptions(subscriptions: StoredPushSubscription[], payload: PushPayload): Promise<number>;
export declare function sendPushToUsers(userIds: number[], payload: PushPayload): Promise<number>;
export {};
//# sourceMappingURL=pushNotifications.d.ts.map