export const getSlotChildren = (
  customEl: HTMLElement,
  slot: HTMLSlotElement
) => {
  if (customEl.shadowRoot) {
    return slot.assignedElements();
  } else {
    return Array.from(slot.children);
  }
};
