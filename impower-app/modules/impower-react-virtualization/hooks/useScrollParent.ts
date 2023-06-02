import { useEffect, useState } from "react";
import { Direction } from "../types/constants";
import { findScrollParent } from "../utils/findScrollParent";

export const useScrollParent = (
  el: HTMLElement,
  scrollDirection?: Direction
): HTMLElement => {
  const [scrollParent, setScrollParent] = useState<HTMLElement>();

  useEffect(() => {
    setScrollParent(findScrollParent(el, scrollDirection));
  }, [el, scrollDirection]);

  return scrollParent;
};
