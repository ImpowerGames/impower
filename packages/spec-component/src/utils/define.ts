export const define = async (
  tag: string,
  constructor: CustomElementConstructor,
): Promise<CustomElementConstructor> => {
  if (!customElements.get(tag)) {
    customElements.define(tag, constructor);
  }
  return customElements.whenDefined(tag);
};
