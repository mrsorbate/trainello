import db from '../database/init';

function runAutoDecline() {
  try {
    db.prepare(`
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
  } catch (error) {
    console.error('Auto-decline scheduler error:', error);
  }
}

export function startScheduler(): void {
  runAutoDecline();
  setInterval(runAutoDecline, 5 * 60 * 1000);
}
