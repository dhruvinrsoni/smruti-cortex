/**
 * Wire an image element to hide itself when the URL fails to load.
 * Extension pages enforce a strict CSP: inline onerror on injected HTML is blocked.
 */
export function wireHideImgOnError(img: HTMLImageElement | null | undefined): void {
  if (!img) {return;}
  img.addEventListener(
    'error',
    () => {
      img.style.display = 'none';
    },
    { once: true },
  );
}
