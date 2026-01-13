import { useState, useEffect, useRef } from "react";

export function useAnimatedNumber(
  value: number,
  duration: number = 500,
  shouldAnimate: boolean = true,
) {
  // 初始值设为实际值，如果不需要动画则直接显示
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(value);
  const animationFrameRef = useRef<number | null>(null);
  const previousValueRef = useRef(value);
  const previousShouldAnimateRef = useRef(shouldAnimate);
  const displayValueRef = useRef(value);
  const hasAnimatedRef = useRef(false);

  // 同步 displayValueRef
  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    // 如果值没有变化且 shouldAnimate 也没有变化，不需要动画
    if (
      value === previousValueRef.current &&
      previousShouldAnimateRef.current === shouldAnimate
    ) {
      return;
    }

    const wasAnimating = previousShouldAnimateRef.current;
    previousValueRef.current = value;
    previousShouldAnimateRef.current = shouldAnimate;

    // 取消之前的动画
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // 如果不应该动画，直接更新值
    if (!shouldAnimate) {
      // 使用 setTimeout 避免同步 setState
      setTimeout(() => {
        setDisplayValue(value);
        displayValueRef.current = value;
        hasAnimatedRef.current = false;
      }, 0);
      return;
    }

    // 如果 shouldAnimate 从 false 变为 true，从 0 开始动画
    if (!wasAnimating && shouldAnimate && !hasAnimatedRef.current) {
      startValueRef.current = 0;
      displayValueRef.current = 0;
      // 使用 setTimeout 避免同步 setState
      setTimeout(() => {
        setDisplayValue(0);
      }, 0);
      hasAnimatedRef.current = true;
    } else {
      startValueRef.current = displayValueRef.current;
    }

    // 使用 requestAnimationFrame 延迟状态更新，避免同步 setState
    const startAnimation = () => {
      setIsAnimating(true);
      const startTime = performance.now();
      startTimeRef.current = startTime;

      const animate = (currentTime: number) => {
        if (!startTimeRef.current) return;

        const elapsed = currentTime - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);

        // 使用缓动函数
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

    // 延迟启动动画，避免在 effect 中同步调用 setState
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

  // 当 shouldAnimate 变为 false 时，重置 hasAnimatedRef
  useEffect(() => {
    if (!shouldAnimate) {
      hasAnimatedRef.current = false;
    }
  }, [shouldAnimate]);

  return { displayValue, isAnimating };
}

