const proxy = <T extends object, F extends (data: T) => void>(
  data: T,
  callback: F,
  rootObj = data
): T => {
  const object = data as any;
  if (object == null || typeof object !== "object") {
    return object;
  }
  Object.keys(object).forEach((key) => {
    object[key] = proxy(object[key], callback, rootObj);
  });
  return new Proxy(object, {
    get: (target, property) => {
      return target[property];
    },
    set: (target, property, value) => {
      if (target[property] === value) {
        return true;
      }
      target[property] = proxy(value, callback, rootObj);
      callback?.(rootObj);
      return true;
    },
    deleteProperty: (target, property) => {
      if (target[property] === undefined) {
        return true;
      }
      delete target[property];
      callback?.(rootObj);
      return true;
    },
  });
};

const reactive = <T extends object, F extends (data: T) => void>(
  data: T,
  callback: F
): T => {
  return proxy(data, callback);
};

export default reactive;
