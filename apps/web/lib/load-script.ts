const cache = new Map<string, Promise<void>>();

export function loadScript(src: string) {
  let promise = cache.get(src);
  if (!promise) {
    promise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        cache.delete(src);
        reject(new Error(`Failed to load ${src}`));
      };
      document.head.appendChild(script);
    });
    cache.set(src, promise);
  }
  return promise;
}
