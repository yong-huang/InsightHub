const prefetchers = new Map<string, Array<() => Promise<unknown>>>()

export function registerPrefetch(path: string, fn: () => Promise<unknown>) {
  const list = prefetchers.get(path)
  if (list) list.push(fn)
  else prefetchers.set(path, [fn])
}

export function prefetchRoute(path: string) {
  prefetchers.get(path)?.forEach(fn => fn())
}
