export function debounce<F extends (...args: any[]) => void>(
  fn: F,
  ms: number,
): F {
  let t: any;
  return ((...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as F;
}
