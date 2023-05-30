const removeData = <T>(
  data: { [refId: string]: T },
  idsToRemove: string[]
): { [refId: string]: T } => {
  if (idsToRemove.length === 0) {
    return data;
  }
  const newData = { ...data };
  idsToRemove.forEach((id) => delete newData[id]);
  return newData;
};

export default removeData;
