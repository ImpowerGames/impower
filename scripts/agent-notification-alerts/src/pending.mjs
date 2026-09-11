import { randomUUID } from 'node:crypto';

export function sessionUrl(app, id) {
  if (app === 'codex' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return `codex://threads/${id}`;
  if (app === 'claude' && /^local_[A-Za-z0-9-]{1,64}$/.test(id)) return `claude://code/continue?session=${id}`;
  if (app === 'claude' && /^(cse|session)_[A-Za-z0-9_-]{1,100}$/.test(id)) return `claude://code/${id}`;
  throw new Error('Unsupported desktop session ID. Omit session if its ID is unavailable.');
}

export class PendingAlerts {
  constructor(entries = []) { this.entries = entries; }
  add(alert, app) {
    if (alert.session) sessionUrl(app, alert.session.id);
    const entry = { notificationId: randomUUID(), app, alert };
    this.entries.push(entry);
    return entry;
  }
  latest(app) { return this.entries.filter(entry => entry.app === app).at(-1); }
  acknowledge(id, app) {
    const index = this.entries.findIndex(entry => entry.notificationId === id && entry.app === app);
    if (index < 0) return false;
    this.entries.splice(index, 1);
    return true;
  }
}
