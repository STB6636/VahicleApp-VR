import { describe, it, expect } from 'vitest';
import { resolveRouterConfig } from '@/lib/routerMode';

describe('resolveRouterConfig (Dual-Hosting Cloudflare Pages & GitHub Pages)', () => {
  it('uses browser mode for Cloudflare Pages', () => {
    expect(resolveRouterConfig('browser', '/', 'vehicle-app.pages.dev')).toEqual({
      mode: 'browser',
      basename: '/',
    });
  });

  it('uses hash mode for GitHub Pages subpath', () => {
    expect(resolveRouterConfig('hash', '/VahicleApp-VR/', 'stb6636.github.io')).toEqual({
      mode: 'hash',
      basename: '/VahicleApp-VR',
    });
  });

  it('defaults to hash on github.io and browser on custom hosts when mode is omitted', () => {
    expect(resolveRouterConfig('', './', 'stb6636.github.io').mode).toBe('hash');
    expect(resolveRouterConfig('', '/', 'vehicle.bma.go.th').mode).toBe('browser');
  });
});
