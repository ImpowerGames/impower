const reverseDataSortDirection = <T>(
  data: { [id: string]: T },
  direction: "asc" | "desc" = "asc"
): { [id: string]: T } => {
  if (direction === "desc") {
    const newData: { [id: string]: T } = {};
    Object.entries(data)
      .reverse()
      .forEach(([k, v]) => {
        newData[k] = v;
      });
    return newData;
  }
  return data;
};

export default reverseDataSortDirection;
