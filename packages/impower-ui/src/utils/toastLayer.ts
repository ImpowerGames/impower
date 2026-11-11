import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";

const layers = signal<readonly HTMLElement[]>([]);

export const topToastLayer = (): HTMLElement | null => layers.value.at(-1) ?? null;

export function useToastLayer(active: boolean) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active || !element) {
      return;
    }
    layers.value = [...layers.value, element];
    return () => {
      layers.value = layers.value.filter((layer) => layer !== element);
    };
  }, [active, element]);
  return setElement;
}
