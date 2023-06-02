const insertData = <T>(
  oldData: { [refId: string]: T },
  newData: { [refId: string]: T }
): { [refId: string]: T } => {
  return { ...oldData, ...newData };
};

export default insertData;
