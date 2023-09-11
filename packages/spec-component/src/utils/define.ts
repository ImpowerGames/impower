const define = async (
  tag: string,
  constructor: CustomElementConstructor
): Promise<CustomElementConstructor> => {
  customElements.define(tag, constructor);
  return customElements.whenDefined(tag);
};

export default define;
