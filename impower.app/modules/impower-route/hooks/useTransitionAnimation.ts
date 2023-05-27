import { useState, useEffect, useRef } from "react";

export enum TransitionState {
  initial = "initial",
  idle = "idle",
  exit = "exit",
  enter = "enter",
}

export const useTransitionAnimation = <T>(
  currentProps: T,
  triggerProperty: keyof T,
  exitDuration: number,
  enterDuration: number,
  initial: boolean,
  onExit?: () => void,
  onEnter?: () => void,
  onComplete?: () => void
): { delayedProps: T; animate: TransitionState } => {
  const [delayedProps, setDelayedProps] = useState(currentProps);
  const [animate, setAnimate] = useState<TransitionState>(
    initial ? TransitionState.initial : TransitionState.enter
  );
  const initialRender = useRef(true);

  const nonTriggerPropertyValues = Object.keys(currentProps)
    .filter((key) => key !== triggerProperty)
    .map((key) => currentProps[key as keyof T]);

  useEffect(() => {
    if (initialRender.current) {
      // Don't transition on first render
      initialRender.current = false;
      return;
    }
    setAnimate(TransitionState.exit);
    if (onExit) {
      onExit();
    }
    window.setTimeout(() => {
      setDelayedProps(currentProps);
      setAnimate(TransitionState.initial);
      window.setTimeout(() => {
        setAnimate(TransitionState.enter);
        if (onEnter) {
          onEnter();
        }
      }, 100);
      window.setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, enterDuration);
    }, exitDuration);
  }, [currentProps[triggerProperty]]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setDelayedProps({
      ...currentProps,
      [triggerProperty]: delayedProps[triggerProperty],
    } as T);
  }, [...nonTriggerPropertyValues]); // eslint-disable-line react-hooks/exhaustive-deps

  return { delayedProps, animate };
};
