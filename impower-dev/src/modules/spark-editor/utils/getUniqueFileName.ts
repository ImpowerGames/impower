const getUniqueFileName = (
  names: string[],
  defaultName: string,
  ignoreIndex?: number,
  maxCollisionsAllowed?: number
): string => {
  const defaultIndexStr = defaultName.match(/\d+/)?.[0];
  const extIndex = defaultName.indexOf(".");
  const padStart = defaultIndexStr?.length ?? 2;
  let key = defaultName;
  let suffix = 0;
  let collisionCount = 0;

  while (collisionCount < (maxCollisionsAllowed || Number.MAX_SAFE_INTEGER)) {
    let collision = false;

    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];

      if (i !== ignoreIndex) {
        if (name && name.toLowerCase() === key.toLowerCase()) {
          collision = true;
          suffix += 1;
          const indexStr = suffix.toString().padStart(padStart, "0");
          key = defaultIndexStr
            ? defaultName.replace(defaultIndexStr, indexStr)
            : extIndex >= 0
            ? defaultName.slice(0, extIndex) +
              indexStr +
              defaultName.slice(extIndex)
            : defaultName + indexStr;
        }
      }
    }

    if (!collision) {
      return key;
    }

    collisionCount += 1;
  }

  return defaultName;
};

export default getUniqueFileName;
