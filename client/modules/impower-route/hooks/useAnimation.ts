/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/rules-of-hooks */
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { PresenceContext } from "../contexts/presenceContext";
import { Ease } from "../types/definitions/ease";
import { bezier } from "../utils/bezier";

export interface AnimationProps
  extends React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  > {
  animate?: number;
  initial?: number;
  exit?: number;
  duration?: number;
  delay?: number;
  ease?: Ease | string;
  transitionProperty?: string;
  ignoreContext?: boolean;
  style?: React.CSSProperties;
}

export function useAnimation(
  props: AnimationProps
): [number, React.CSSProperties, (e: React.TransitionEvent) => void] {
  const context = useContext(PresenceContext);

  const initialRender = useRef(true);

  const {
    animate = 1,
    initial,
    exit,
    duration = 0.3,
    delay,
    ease = "ease-out-back",
    style,
    transitionProperty,
    ignoreContext,
  } = props;

  const [state, setState] = useState(initial !== undefined ? initial : animate);

  const noEnterAnimation =
    initialRender.current && initial !== undefined && initial !== null;

  const validDuration = noEnterAnimation ? 0 : duration || 0;
  const validDelay = noEnterAnimation ? 0 : delay || 0;

  const animationStyle = {
    transitionDuration: `${validDuration}s`,
    transitionTimingFunction: `${bezier(ease)}`,
    transitionDelay: `${validDelay}s`,
    ...style,
  };

  useEffect(() => {
    window.requestAnimationFrame(() => {
      setState(animate);
      initialRender.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate]);

  if (context === null || ignoreContext) {
    initialRender.current = false;
    return [state, animationStyle, null];
  }

  const latestInitialRender = useRef(true);

  const {
    isPresent,
    isFirstTime,
    disableFirstTimeEnter,
    exitProps,
    onExitComplete,
  } = context;

  const initializedProps = {
    animate,
    initial,
    exit,
    duration,
    delay,
    ease,
    style,
    transitionProperty,
  };

  const latestProps = { ...initializedProps, ...exitProps };

  if (disableFirstTimeEnter && isFirstTime) {
    latestProps.initial = latestProps.animate;
  }

  const {
    initial: latestInitial,
    animate: latestAnimate,
    exit: latestExit,
    transitionProperty: latestTransitionProperty,
    style: latestStyle,
  } = latestProps;

  const latestNoEnterAnimation =
    latestInitialRender.current &&
    latestInitial !== undefined &&
    latestInitial !== null;

  const latestValidDuration = latestNoEnterAnimation ? 0 : duration || 0;
  const latestValidDelay = latestNoEnterAnimation ? 0 : delay || 0;

  const latestAnimationStyle = {
    transitionDuration: `${latestValidDuration}s`,
    transitionTimingFunction: `${bezier(ease)}`,
    transitionDelay: `${latestValidDelay}s`,
    ...latestStyle,
  };

  // It's safe to call the following hooks conditionally (after an early return) because the context will always
  // either be null or non-null for the lifespan of the component.

  const safeExitHandler = (): void => onExitComplete?.();

  const [latestState, setLatestState] = useState(
    latestInitial !== undefined ? latestInitial : latestAnimate
  );
  const exiting = useRef(false);

  const handleTransitionEnd = useCallback(
    (e) => {
      if (e.propertyName === latestTransitionProperty) {
        if (exiting.current) {
          safeExitHandler();
        }
      }
    },
    [latestTransitionProperty]
  );

  useEffect(() => {
    window.requestAnimationFrame(() => {
      if (isPresent) {
        setLatestState(latestAnimate);
        exiting.current = false;
      } else if (latestExit !== undefined && latestExit !== null) {
        setLatestState(latestExit);
        exiting.current = true;
      } else {
        safeExitHandler();
      }
      latestInitialRender.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresent, latestAnimate]);

  return [latestState, latestAnimationStyle, handleTransitionEnd];
}
