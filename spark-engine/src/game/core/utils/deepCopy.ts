export const deepCopy = <T>(obj: T): T => {
  if (obj == null) {
    return obj;
  }
  const replacer = (_key: string, value: any) => {
    if (value instanceof RegExp) return "__REGEXP " + value.toString();
    else return value;
  };
  const reviver = (_key: string, value: any) => {
    if (value.toString().indexOf("__REGEXP ") == 0) {
      var m = value.split("__REGEXP ")[1].match(/\/(.*)\/(.*)?/);
      return new RegExp(m[1], m[2] || "");
    } else return value;
  };
  return JSON.parse(JSON.stringify(obj, replacer, 2), reviver);
};
