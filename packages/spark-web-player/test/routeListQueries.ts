export const shownText = (element: Element) => {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll("[aria-hidden='true']").forEach((e) => e.remove());
  return copy.textContent;
};

export const routeTabs = (list: ParentNode) => [
  ...list.querySelectorAll<HTMLButtonElement>("[role='tab']"),
];

export const pickTab = (tab: HTMLElement) => {
  tab.dispatchEvent(
    new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
  );
  tab.click();
};
