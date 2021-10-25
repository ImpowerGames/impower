const getStorageId = (storageKey: string): string => {
  const lastSlash = storageKey.lastIndexOf("/");
  return storageKey.substring(lastSlash);
};

export default getStorageId;
