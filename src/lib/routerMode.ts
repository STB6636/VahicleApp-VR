export type RouterMode = 'browser' | 'hash';

export interface RouterConfig {
  mode: RouterMode;
  basename: string;
}

export function resolveRouterConfig(
  rawMode?: string,
  rawBasePath?: string,
  hostname?: string
): RouterConfig {
  const normalizedMode = String(rawMode || '').trim().toLowerCase();
  const host = String(hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();

  let mode: RouterMode = 'hash';
  if (normalizedMode === 'browser') {
    mode = 'browser';
  } else if (normalizedMode === 'hash') {
    mode = 'hash';
  } else if (host && !host.endsWith('github.io') && host !== '') {
    mode = 'browser';
  }

  let basename = String(rawBasePath || '/').trim();
  if (!basename || basename === './' || basename === '.') {
    basename = '/';
  }
  if (!basename.startsWith('/')) {
    basename = `/${basename}`;
  }
  if (basename.length > 1 && basename.endsWith('/')) {
    basename = basename.slice(0, -1);
  }

  return { mode, basename };
}

export function getAppRouterConfig(): RouterConfig {
  return resolveRouterConfig(
    import.meta.env.VITE_ROUTER_MODE as string | undefined,
    import.meta.env.VITE_BASE_PATH as string | undefined
  );
}
