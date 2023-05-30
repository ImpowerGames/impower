const getToday = (): number => {
  return Math.trunc(Date.now() / 1000 / 60 / 60 / 24);
};

export default getToday;
