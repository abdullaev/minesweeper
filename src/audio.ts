import explosionSoundUrl from './assets/explosion-sound.mp3';
import tickSoundUrl from './assets/tick.mp3';

export type SoundEffect = 'start' | 'open' | 'expand' | 'flag' | 'unflag' | 'win' | 'lose';

/** Synthesized UI sounds and bundled countdown/explosion recordings. */
export class GameAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private voices = new Set<AudioScheduledSourceNode>();
  private generation = 0;
  private recordings = new Map<string, Promise<AudioBuffer | null>>();

  constructor(private enabled: boolean) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  unlock(): void {
    if (!this.enabled || document.hidden) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = 0.18;
        this.output.connect(this.context.destination);
        void this.loadRecording(tickSoundUrl);
        void this.loadRecording(explosionSoundUrl);
      }
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
    } catch { /* Unsupported or blocked audio must not interrupt the game. */ }
  }

  stop(): void {
    this.generation++;
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* The voice may already have ended. */ }
    }
    this.voices.clear();
  }

  play(effect: SoundEffect): void {
    if (!this.enabled || document.hidden) return;
    this.unlock();
    const context = this.context;
    if (!context || !this.output) return;
    this.stop();
    const generation = this.generation;
    const isCurrent = (): boolean => this.enabled && !document.hidden && generation === this.generation && context.state === 'running';
    const schedule = async (): Promise<void> => {
      // Do not replay an old action after unmuting or a delayed browser resume.
      if (!isCurrent()) return;
      try {
        if (effect === 'lose') {
          const [tick, explosion] = await Promise.all([
            this.loadRecording(tickSoundUrl),
            this.loadRecording(explosionSoundUrl),
          ]);
          if (!isCurrent()) return;
          // Schedule both on one clock: two seconds of ticking, then the blast.
          // Both sources are tracked, so stop() also cancels the pending blast.
          const start = context.currentTime + 0.005;
          if (tick) this.playRecording(tick, start);
          if (explosion) this.playRecording(explosion, start + 2);
        } else {
          this.synthesize(effect, context.currentTime + 0.005);
        }
      } catch { if (generation === this.generation) this.stop(); }
    };
    if (context.state === 'running') void schedule();
    else void context.resume().then(schedule).catch(() => {});
  }

  private loadRecording(url: string): Promise<AudioBuffer | null> {
    const cached = this.recordings.get(url);
    if (cached) return cached;
    const context = this.context!;
    const loading = fetch(url)
      .then(response => {
        if (!response.ok) throw new Error('Could not load sound');
        return response.arrayBuffer();
      })
      .then(data => context.decodeAudioData(data))
      .catch(() => {
        this.recordings.delete(url);
        return null;
      });
    this.recordings.set(url, loading);
    return loading;
  }

  private playRecording(buffer: AudioBuffer, time: number): void {
    const source = this.context!.createBufferSource();
    source.buffer = buffer;
    source.connect(this.output!);
    this.track(source, []);
    source.start(time);
  }

  private synthesize(effect: Exclude<SoundEffect, 'lose'>, time: number): void {
    switch (effect) {
      case 'start':
        this.tone(392, time, 0.1, 0.35);
        this.tone(523, time + 0.07, 0.14, 0.35);
        break;
      case 'open': this.tone(660, time, 0.075, 0.35, 440); break;
      case 'expand':
        this.tone(523, time, 0.1, 0.3);
        this.tone(784, time + 0.045, 0.13, 0.3);
        break;
      case 'flag': this.tone(740, time, 0.11, 0.4, 990); break;
      case 'unflag': this.tone(620, time, 0.09, 0.3, 410); break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
          this.tone(frequency, time + i * 0.105, i === 3 ? 0.3 : 0.18, 0.45);
        });
        break;
    }
  }

  private tone(frequency: number, time: number, duration: number, volume: number, endFrequency = frequency, type: OscillatorType = 'triangle'): void {
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, time + duration);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(this.output!);
    this.track(oscillator, [gain]);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.01);
  }

  private track(source: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    this.voices.add(source);
    source.onended = () => {
      source.disconnect();
      nodes.forEach(node => node.disconnect());
      this.voices.delete(source);
    };
  }
}
