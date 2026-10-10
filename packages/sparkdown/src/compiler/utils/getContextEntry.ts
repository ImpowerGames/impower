/** Context tables contain authored entries, never Object.prototype members. */
export const getContextEntry = (
  context: { [type: string]: { [name: string]: any } } | undefined,
  type: string,
  name: string,
): any => {
  if (!context || !Object.hasOwn(context, type)) return undefined;
  const table = context[type];
  return table && Object.hasOwn(table, name) ? table[name] : undefined;
};
