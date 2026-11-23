export const swallowNextClick = (ownerDocument: Document = document) => {
  const swallow = (event: MouseEvent) => {
    if (!event.isTrusted) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const stop = () => {
    ownerDocument.removeEventListener("click", swallow, true);
    ownerDocument.removeEventListener("pointerdown", stop, true);
    ownerDocument.removeEventListener("pointercancel", stop, true);
  };
  ownerDocument.addEventListener("click", swallow, true);
  ownerDocument.addEventListener("pointerdown", stop, true);
  ownerDocument.addEventListener("pointercancel", stop, true);
};
