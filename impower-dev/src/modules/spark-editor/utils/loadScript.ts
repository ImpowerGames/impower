const loadScript = (src: string) => {
  return new Promise((resolve, reject) => {
    try {
      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.src = src;
      script.onload = () => {
        resolve(script);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    } catch (err) {
      reject(err);
    }
  });
};

export default loadScript;
