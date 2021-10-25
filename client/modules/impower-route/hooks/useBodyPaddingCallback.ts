import { useCallback, useEffect } from "react";

export const useBodyPaddingCallback = (
  attr: "paddingRight" | "right" = "paddingRight",
  offset: number | string = 0,
  ...elements: HTMLElement[]
): void => {
  const documentBody =
    typeof document !== "undefined" ? document.body : undefined;

  const handleMutateHtml = useCallback(() => {
    if (elements && documentBody) {
      const bodyPadding = documentBody.style.paddingRight;
      const isBodyPadded =
        bodyPadding !== undefined &&
        bodyPadding !== null &&
        bodyPadding !== "" &&
        bodyPadding !== "0" &&
        bodyPadding !== "0px";
      const offsetAttrValue =
        typeof offset === "number" ? `${offset}px` : offset;
      if (isBodyPadded) {
        if (elements) {
          elements.forEach((el) => {
            if (el) {
              if (attr === "paddingRight") {
                el.style.paddingRight = `calc(${offsetAttrValue} + ${bodyPadding})`;
              }
              if (attr === "right") {
                el.style.right = `calc(${offsetAttrValue} + ${bodyPadding})`;
              }
            }
          });
        }
      } else {
        elements.forEach((el) => {
          if (el) {
            if (attr === "paddingRight") {
              el.style.paddingRight = offsetAttrValue;
            }
            if (attr === "right") {
              el.style.right = offsetAttrValue;
            }
          }
        });
      }
    }
  }, [attr, documentBody, elements, offset]);

  useEffect(() => {
    if (!documentBody) {
      return (): void => null;
    }

    const observer = new MutationObserver(handleMutateHtml);
    observer.observe(documentBody, {
      attributes: true,
    });

    handleMutateHtml();

    return (): void => {
      observer.disconnect();
    };
  }, [documentBody, handleMutateHtml]);
};
