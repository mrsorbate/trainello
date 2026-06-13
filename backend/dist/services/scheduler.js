"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const init_1 = __importDefault(require("../database/init"));
function runAutoDecline() {
    try {
        init_1.default.prepare(`
      UPDATE event_responses
      SET status = 'declined',
          responded_at = CURRENT_TIMESTAMP
      WHERE status = 'tentative'
        AND event_id IN (
          SELECT id FROM events
          WHERE rsvp_deadline IS NOT NULL
            AND rsvp_deadline <= ?
        )
    `).run(new Date().toISOString());
    }
    catch (error) {
        console.error('Auto-decline scheduler error:', error);
    }
}
function startScheduler() {
    runAutoDecline();
    setInterval(runAutoDecline, 5 * 60 * 1000);
}
//# sourceMappingURL=scheduler.js.map