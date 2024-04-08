import STYLES from "../caches/STYLE_CACHE";

const adoptAll = (styles: Record<string, string>): void => {
  Object.values(styles).forEach((css) => {
    STYLES.adoptStyle(document, css);
  });
};

export default adoptAll;
