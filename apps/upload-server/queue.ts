import { randomUUID } from 'node:crypto';
import { isPaused, type Config, type PhotoRecord, type Transport } from '../../packages/shared/config.ts';

/** Order is reserved before async decoding. Only the renderer holding the lease can drive this queue. */
export class PhotoQueue {
  photos: PhotoRecord[] = [];
  activeId: string | null = null;
  private sequence = 0;
  constructor(public config: Config, public transport: Transport) {}
  restore(photos: PhotoRecord[]) {
    this.photos = photos.map(p => ({ ...p, status: p.status === 'Processing' ? 'Failed' : ['Active', 'Fading'].includes(p.status) ? 'Queued' : p.status, age: ['Active', 'Fading'].includes(p.status) ? 0 : p.age }));
    this.sequence = Math.max(0, ...photos.map(p => p.seq));
  }
  reserve(name: string, owner: string): PhotoRecord {
    if (this.photos.filter(p => ['Processing', 'Pending', 'Queued', 'Active', 'Fading'].includes(p.status)).length >= this.config.photos.maxQueued) throw new Error('队列已满，请稍后再来。');
    const photo: PhotoRecord = { id: randomUUID(), seq: ++this.sequence, name: name.slice(0, 100), status: 'Processing', receivedAt: Date.now(), age: 0, aspect: 1, owner };
    this.photos.push(photo);
    return photo;
  }
  get(id: string) { return this.photos.find(p => p.id === id); }
  ready(id: string, aspect: number, details: Pick<PhotoRecord, 'palette' | 'luminance'> = {}) {
    const p = this.get(id);
    if (!p || p.status !== 'Processing') return false;
    Object.assign(p, details, { aspect, status: this.config.photos.moderation ? 'Pending' : 'Queued' });
    return true;
  }
  approve(id: string) { const p = this.get(id); if (p?.status === 'Pending') p.status = 'Queued'; }
  fail(id: string, reason: string) { const p = this.get(id); if (p && !['Deleted', 'Done'].includes(p.status)) { p.status = 'Failed'; p.error = reason; if (this.activeId === id) this.activeId = null; } }
  delete(id: string) { const p = this.get(id); if (!p) return; p.status = 'Deleted'; p.name = ''; delete p.palette; delete p.luminance; if (this.activeId === id) this.activeId = null; }
  next() {
    if (this.activeId) return this.get(this.activeId);
    if (isPaused(this.transport)) return undefined;
    // Pending approval is a separate holding area; processing at the queue head still blocks later files.
    const head = this.photos.find(p => p.status === 'Processing' || p.status === 'Queued');
    return head?.status === 'Queued' ? head : undefined;
  }
  start(id: string) {
    if (isPaused(this.transport)) return false;
    if (this.activeId === id) return true;
    if (this.next()?.id !== id) return false;
    this.activeId = id;
    this.get(id)!.status = 'Active';
    return true;
  }
  advance(id: string, delta: number) {
    if (isPaused(this.transport) || this.activeId !== id || !Number.isFinite(delta) || delta < 0) return;
    const p = this.get(id)!;
    p.age += Math.min(delta, .5);
    if (p.age >= this.config.photos.activeForSeconds + this.config.photos.fadeOutSeconds) {
      p.age = this.config.photos.activeForSeconds + this.config.photos.fadeOutSeconds; p.status = 'Done'; this.activeId = null;
    } else if (p.age >= this.config.photos.activeForSeconds) p.status = 'Fading';
  }
  expire(now = Date.now()) { for (const p of this.photos) if (p.status === 'Processing' && now - p.receivedAt > 45000) this.fail(p.id, '处理超时，请换一张图片。'); }
}
