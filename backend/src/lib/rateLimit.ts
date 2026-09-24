import { NextFunction, Request, Response } from 'express';

/**
 * Limiteur à fenêtre fixe, en mémoire et par IP (une seule instance sur Railway). Suffisant pour
 * les formulaires publics ; à remplacer par un store partagé si l'API passe à plusieurs instances.
 */
export function rateLimit({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      // Purge opportuniste des fenêtres expirées
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res
        .status(429)
        .json({ status: 'error', code: 'RATE_LIMITED', message: 'Too many requests, please retry later.' });
    }
    next();
  };
}

/** Échappe le texte utilisateur inséré dans un gabarit HTML (e-mails). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
