import { RANGE_PRE_ROLL_SECONDS } from './timing';

type TimeCallback = (t: number) => void;

export class AudioEngine {
  private audio: HTMLAudioElement;
  private rafId: number | null = null;
  private cb: TimeCallback;
  private stopAt: number | null = null;
  private onRangePausedFn: (() => void) | null = null;

  constructor(src: string, onTime: TimeCallback) {
    this.audio = new Audio(src);
    this.audio.preload = 'metadata';
    this.cb = onTime;
  }

  get currentTime() { return this.audio.currentTime; }
  get duration() { return this.audio.duration || 0; }
  get paused() { return this.audio.paused; }
  get element() { return this.audio; }

  async play() {
    this.stopAt = null;
    await this.audio.play();
    this.startRaf();
  }

  pause() {
    this.audio.pause();
    this.stopRaf();
  }

  seek(t: number) {
    this.audio.currentTime = t;
    this.cb(t);
  }

  async seekAndPlay(t: number) {
    this.stopAt = null;
    this.audio.currentTime = t;
    await this.audio.play();
    this.startRaf();
  }

  async playRange(start: number, end: number) {
    this.stopAt = end;
    this.audio.currentTime = Math.max(0, start - RANGE_PRE_ROLL_SECONDS);
    await this.audio.play();
    this.startRaf();
  }

  destroy() {
    this.stopRaf();
    this.audio.pause();
    this.audio.src = '';
  }

  private startRaf() {
    this.stopRaf();
    const tick = () => {
      if (this.stopAt !== null && this.audio.currentTime >= this.stopAt) {
        this.audio.pause();
        this.stopAt = null;
        this.stopRaf();
        this.cb(this.audio.currentTime);
        this.onRangePausedFn?.();
        return;
      }
      this.cb(this.audio.currentTime);
      if (!this.audio.paused) {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  onEnded(fn: () => void) {
    this.audio.addEventListener('ended', () => { this.stopRaf(); fn(); });
  }

  onRangePaused(fn: () => void) {
    this.onRangePausedFn = fn;
  }

  onLoadedMetadata(fn: () => void) {
    this.audio.addEventListener('loadedmetadata', fn);
  }
}
