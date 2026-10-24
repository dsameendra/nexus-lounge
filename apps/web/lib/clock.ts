import { median } from "@nexus/shared";

const MAX_SAMPLES = 16;

export class ClockSync {
  private samples: { offset: number; rtt: number }[] = [];
  private cached = 0;

  get ready() {
    return this.samples.length >= 3;
  }

  get offset() {
    return this.cached;
  }

  now() {
    return Date.now() + this.cached;
  }

  addSample(sentAt: number, serverTime: number, receivedAt: number) {
    const rtt = receivedAt - sentAt;
    if (rtt < 0 || rtt > 5000) return;
    this.samples.push({ offset: serverTime - (sentAt + receivedAt) / 2, rtt });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    const byRtt = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const best = byRtt.slice(0, Math.max(3, Math.ceil(byRtt.length / 2)));
    this.cached = median(best.map((sample) => sample.offset));
  }

  reset() {
    this.samples = [];
    this.cached = 0;
  }
}
