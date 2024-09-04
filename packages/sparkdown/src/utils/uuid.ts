const uuid = (
  size = 8,
  alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
) => {
  let id = "";
  let i = size;
  while (i--) {
    id += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return id;
};

export default uuid;
