export const getSlotChildren = (
  customEl: HTMLElement,
  slot: HTMLSlotElement | null
) => {
  if (!slot) {
    return [];
  }
  if (customEl.shadowRoot) {
    return slot.assignedElements();
  } else {
    return Array.from(slot.children);
  }
};
