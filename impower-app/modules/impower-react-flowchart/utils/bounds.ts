const int = (a: string): number => {
  return parseInt(a, 10);
};

const outerWidth = (node: HTMLElement): number => {
  // This is deliberately excluding margin for our calculations, since we are using
  // offsetLeft which is including margin. See getBoundPosition
  let width = node.clientWidth;
  const computedStyle = window.getComputedStyle(node);
  width += int(computedStyle.borderLeftWidth);
  width += int(computedStyle.borderRightWidth);
  return width;
};

const outerHeight = (node: HTMLElement): number => {
  // This is deliberately excluding margin for our calculations, since we are using
  // offsetTop which is including margin. See getBoundPosition
  let height = node.clientHeight;
  const computedStyle = window.getComputedStyle(node);
  height += int(computedStyle.borderTopWidth);
  height += int(computedStyle.borderBottomWidth);
  return height;
};

export const getBounds = (
  node: HTMLElement | null,
  boundsOffset = { left: 0, top: 0, right: 0, bottom: 0 }
): { top: number; left: number; bottom: number; right: number } | undefined => {
  if (!node) {
    return undefined;
  }
  const nodeStyle = window.getComputedStyle(node);
  // Compute bounds. This is a pain with padding and offsets but this gets it exactly right.
  return {
    left: -node.offsetLeft + int(nodeStyle.marginLeft) + boundsOffset.left,
    top: -node.offsetTop + int(nodeStyle.marginTop) + boundsOffset.top,
    right:
      outerWidth(node) -
      node.offsetLeft +
      int(nodeStyle.marginRight) +
      boundsOffset.right,
    bottom:
      outerHeight(node) -
      node.offsetTop +
      int(nodeStyle.marginBottom) +
      boundsOffset.bottom,
  };
};
