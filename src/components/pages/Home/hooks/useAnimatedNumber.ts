import { useState, useEffect, useRef } from "react";

export function useAnimatedNumber(
  value: number,
  duration: number = 500,
  shouldAnimate: boolean = true,
) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);
  const previousValueRef = useRef(value);
  const previousShouldAnimateRef = useRef(shouldAnimate);
  const displayValueRef = useRef(value);
  const hasAnimatedRef = useRef(false);

  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    if (
      value === previousValueRef.current &&
      previousShouldAnimateRef.current === shouldAnimate
    ) {
      return;
    }

    const wasAnimating = previousShouldAnimateRef.current;
    previousValueRef.current = value;
    previousShouldAnimateRef.current = shouldAnimate;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (!shouldAnimate) {
      setTimeout(() => {
        setDisplayValue(value);
        displayValueRef.current = value;
        hasAnimatedRef.current = false;
      }, 0);
      return;
    }

    if (!wasAnimating && shouldAnimate && !hasAnimatedRef.current) {
      startValueRef.current = 0;
      displayValueRef.current = 0;
      setTimeout(() => {
        setDisplayValue(0);
      }, 0);
      hasAnimatedRef.current = true;
    } else {
      startValueRef.current = displayValueRef.current;
    }

    const startAnimation = () => {
      setIsAnimating(true);
      const startTime = performance.now();
      startTimeRef.current = startTime;

      const animate = (currentTime: number) => {
        if (!startTimeRef.current) return;

        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.floor(
          startValueRef.current +
            (value - startValueRef.current) * easeOutCubic,
        );

        setDisplayValue(currentValue);
        displayValueRef.current = currentValue;

        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        } else {
          setDisplayValue(value);
          displayValueRef.current = value;
          setIsAnimating(false);
          startTimeRef.current = null;
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    const timeoutId = setTimeout(() => {
      requestAnimationFrame(startAnimation);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [value, duration, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) {
      hasAnimatedRef.current = false;
    }
  }, [shouldAnimate]);

  return { displayValue, isAnimating };
}
