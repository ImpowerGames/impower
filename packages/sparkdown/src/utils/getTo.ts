const getTo = (from: number, content: string | undefined): number => {
  return from + (content ? content.length : 0) - 1;
};

export default getTo;
