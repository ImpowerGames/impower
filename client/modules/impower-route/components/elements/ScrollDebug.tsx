import React, { useCallback, useEffect, useState } from "react";
import { getLabel } from "../../../impower-config";
import {
  getScrollY,
  useScrollEffect,
} from "../../../impower-react-virtualization";

interface ScrollDebugProps {
  scrollParent?: HTMLElement;
}

const ScrollDebug = React.memo((props: ScrollDebugProps): JSX.Element => {
  const { scrollParent } = props;
  const [scrollInfo, setScrollInfo] = useState<{
    scrollY?: number;
    scrollBottom?: number;
    bodyBoundingClientHeight?: number;
    bodyScrollHeight?: number;
    bodyOffsetHeight?: number;
    bodyClientHeight?: number;
    htmlScrollHeight?: number;
    htmlOffsetHeight?: number;
    htmlClientHeight?: number;
    windowInnerHeight?: number;
    windowOuterHeight?: number;
  }>({});
  const [originalInnerHeight, setOriginalInnerHeight] = useState(0);

  const handleUpdate = useCallback(() => {
    const scrollY = scrollParent ? getScrollY(scrollParent) : 0;
    const windowHeight =
      window?.innerHeight || document?.documentElement?.offsetHeight;
    setScrollInfo({
      scrollY,
      scrollBottom: scrollY + windowHeight,
      bodyBoundingClientHeight: document?.body?.getBoundingClientRect()?.height,
      bodyScrollHeight: document?.body?.scrollHeight,
      bodyOffsetHeight: document?.body?.offsetHeight,
      bodyClientHeight: document?.body?.clientHeight,
      htmlScrollHeight: document?.documentElement?.scrollHeight,
      htmlOffsetHeight: document?.documentElement?.offsetHeight,
      htmlClientHeight: document?.documentElement?.clientHeight,
      windowInnerHeight: window?.innerHeight,
      windowOuterHeight: window?.outerHeight,
    });
  }, [scrollParent]);

  useEffect(() => {
    handleUpdate();
    setOriginalInnerHeight(window?.innerHeight);
  }, [handleUpdate]);

  useScrollEffect(scrollParent, handleUpdate);

  useEffect(() => {
    window.addEventListener("resize", handleUpdate, {
      passive: true,
    });
    return (): void => {
      window.removeEventListener("resize", handleUpdate);
    };
  }, [handleUpdate]);

  useEffect(() => {
    const interval = setInterval(() => {
      handleUpdate();
    }, 1000);
    return (): void => clearInterval(interval);
  }, [handleUpdate]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        zIndex: 1000,
        textAlign: "right",
        backgroundColor: "rgba(255,255,255,0.3)",
      }}
    >
      <input />
      {Object.entries(scrollInfo).map(([key, value]) => (
        <div key={key}>
          {getLabel(key)}: {value}
        </div>
      ))}
      <div>
        Inner Height Change:
        {(originalInnerHeight || 0) - (scrollInfo.windowInnerHeight || 0)}
      </div>
    </div>
  );
});

export default ScrollDebug;
