const getUniqueName = (
  names: string[],
  defaultName: string,
  ignoreIndex?: number,
  maxCollisionsAllowed?: number
): string => {
  const baseName = defaultName.replace(/\d+$/, "");

  let key = defaultName;
  let suffix = 0;
  let collisionCount = 0;

  while (collisionCount < (maxCollisionsAllowed || Number.MAX_SAFE_INTEGER)) {
    let collision = false;

    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];

      if (i !== ignoreIndex) {
        if (name.toLowerCase() === key.toLowerCase()) {
          collision = true;
          suffix += 1;
          key = baseName + suffix;
        }
      }
    }

    if (!collision) {
      return key;
    }

    collisionCount += 1;
  }

  return `${baseName}#`;
};

export default getUniqueName;
