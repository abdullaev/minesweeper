export class GifEffect {
  private asset: Promise<Blob | null> | null = null;
  private animation: Animation | null = null;
  private objectUrl: string | null = null;
  private generation = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly url: string,
    private readonly duration: number,
  ) {}

  preload(): Promise<Blob | null> {
    this.asset ??= fetch(this.url)
      .then(response => {
        if (!response.ok) throw new Error('Could not load effect GIF');
        return response.blob();
      })
      .catch(() => {
        this.asset = null;
        return null;
      });
    return this.asset;
  }

  play(onStart: () => void, ready: Promise<void> = Promise.resolve()): void {
    this.stop();
    if (document.hidden) return;
    const generation = this.generation;
    const isCurrent = (): boolean => generation === this.generation && !document.hidden;
    void Promise.all([this.preload(), ready]).then(([blob]) => {
      if (!isCurrent()) return;
      if (!blob) {
        onStart();
        return;
      }
      // A fresh URL restarts the GIF at frame one, including on rapid replays.
      this.objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.alt = '';
      image.draggable = false;
      image.onload = () => {
        if (!isCurrent()) return;
        this.host.hidden = false;
        this.animation = this.host.animate([
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.08 },
          { opacity: 1, offset: 0.8 },
          { opacity: 0, offset: 1 },
        ], { duration: this.duration, easing: 'ease-in-out', fill: 'both' });
        this.animation.onfinish = () => { if (isCurrent()) this.stop(); };
        onStart();
      };
      image.onerror = () => {
        if (!isCurrent()) return;
        this.stop();
        onStart();
      };
      this.host.replaceChildren(image);
      image.src = this.objectUrl;
    });
  }

  stop(): void {
    this.generation++;
    this.animation?.cancel();
    this.animation = null;
    this.host.hidden = true;
    this.host.replaceChildren();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
