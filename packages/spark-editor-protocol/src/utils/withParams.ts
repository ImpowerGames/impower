export const withParams = <M extends { params: object }>(
  message: M,
  params: Partial<M["params"]>,
): M => ({ ...message, params: { ...message.params, ...params } });
