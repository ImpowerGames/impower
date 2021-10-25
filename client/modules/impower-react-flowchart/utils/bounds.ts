const int = (a: string): number => {
  return parseInt(a, 10);
};

const innerWidth = (node: HTMLElement): number => {
  let width = node.clientWidth;
  const computedStyle = window.getComputedStyle(node);
  width -= int(computedStyle.paddingLeft);
  width -= int(computedStyle.paddingRight);
  return width;
};

const innerHeight = (node: HTMLElement): number => {
  let height = node.clientHeight;
  const computedStyle = window.getComputedStyle(node);
  height -= int(computedStyle.paddingTop);
  height -= int(computedStyle.paddingBottom);
  return height;
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
  boundsSelector: string,
  boundsOffset = { left: 0, top: 0, right: 0, bottom: 0 }
): { top: number; left: number; bottom: number; right: number } | undefined => {
  if (!node) {
    return undefined;
  }
  let boundNode;
  if (boundsSelector === "parent") {
    boundNode = node.parentNode;
  } else {
    boundNode = window.document.querySelector(boundsSelector);
  }
  if (!(boundNode instanceof window.HTMLElement)) {
    throw new Error(
      `Bounds selector '${boundsSelector}' could not find an element.`
    );
  }
  const nodeStyle = window.getComputedStyle(node);
  const boundNodeStyle = window.getComputedStyle(boundNode);
  // Compute bounds. This is a pain with padding and offsets but this gets it exactly right.
  return {
    left:
      -node.offsetLeft +
      int(boundNodeStyle.paddingLeft) +
      int(nodeStyle.marginLeft) +
      boundsOffset.left,
    top:
      -node.offsetTop +
      int(boundNodeStyle.paddingTop) +
      int(nodeStyle.marginTop) +
      boundsOffset.top,
    right:
      innerWidth(boundNode) -
      outerWidth(node) -
      node.offsetLeft +
      int(boundNodeStyle.paddingRight) -
      int(nodeStyle.marginRight) +
      boundsOffset.right,
    bottom:
      innerHeight(boundNode) -
      outerHeight(node) -
      node.offsetTop +
      int(boundNodeStyle.paddingBottom) -
      int(nodeStyle.marginBottom) +
      boundsOffset.bottom,
  };
};
