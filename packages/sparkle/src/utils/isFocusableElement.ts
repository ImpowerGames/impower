export const isFocusableElement = (el: Element): el is HTMLElement => {
  return (
    el instanceof HTMLElement &&
    !(
      el.inert ||
      el.hidden ||
      ((el.shadowRoot || el).firstElementChild as HTMLElement)?.inert ||
      ((el.shadowRoot || el).firstElementChild as HTMLElement)?.hidden
    )
  );
};
