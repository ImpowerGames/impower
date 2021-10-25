const getValue = <T>(obj: unknown, path: string, defaultValue?: T): T => {
  const travel = (regexp): T =>
    path
      .split(regexp)
      .filter(Boolean)
      .reduce(
        (res, key) => (res !== null && res !== undefined ? res[key] : res),
        obj
      ) as T;
  const result = travel(/[,[\]]+?/) || travel(/[,[\].]+?/);
  return result === undefined || result === obj ? defaultValue : result;
};

export default getValue;
