import { describe, expect, it } from 'vitest';
import { escapeHtml } from './escape-html';

describe('escapeHtml', () => {
  it('neutralizes markup and attribute breakouts', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });

  it('keeps plain text untouched', () => {
    expect(escapeHtml('Raid Mythique — Nerub-ar')).toBe('Raid Mythique — Nerub-ar');
  });
});
