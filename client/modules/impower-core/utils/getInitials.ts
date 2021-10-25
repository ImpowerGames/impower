const getInitials = (name: string, letterCount = 2): string => {
  if (!name) {
    return "";
  }
  const words = name.split(/[ ]+/);
  const firstLetters = words.map((w) => w[0]);
  let initials = "";
  for (let i = 0; i < Math.min(letterCount, firstLetters.length); i += 1) {
    initials += firstLetters[i];
  }
  return initials;
};

export default getInitials;
