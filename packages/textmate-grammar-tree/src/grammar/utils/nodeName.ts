const escapeName = (part: string) =>
  part.replace(/[%#]/g, (c) => (c === "%" ? "%25" : "%23"));

const unescapeName = (part: string) =>
  part.replace(/%2[35]/g, (c) => (c === "%25" ? "%" : "#"));

export const namespaceOf = (scopeName: string) => `${escapeName(scopeName)}#`;

export const nodeName = (namespace: string, local: string) =>
  namespace + escapeName(local);

export const localName = (namespace: string, name: string) =>
  unescapeName(name.slice(namespace.length));
