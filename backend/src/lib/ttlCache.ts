/**
 * Cache mémoire à durée de vie avec déduplication des chargements concurrents.
 * Les erreurs ne sont pas mises en cache. Au-delà de `maxEntries`, l'entrée la plus ancienne est évincée.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inflight = new Map<string, Promise<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
  ) {}

  /** `ttlMs` peut dépendre de la valeur chargée (ex. rapport encore en cours d'enregistrement). */
  async getOrLoad(
    key: string,
    loader: () => Promise<T>,
    ttlMs: number | ((value: T) => number) = this.ttlMs,
  ): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
    if (hit) this.entries.delete(key);

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const promise = loader()
      .then((value) => {
        this.set(key, value, typeof ttlMs === 'function' ? ttlMs(value) : ttlMs);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  private set(key: string, value: T, ttlMs: number) {
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}
