import { useEffect, useState } from "react";

/**
 * The value, a moment after it stopped changing.
 *
 * Search is typed one character at a time on a phone keyboard, and every
 * keystroke is a request over a home connection through a tunnel. 250ms is
 * long enough that a word costs one request and short enough that it still
 * feels like search-as-you-type.
 */
export const useDebouncedValue = <T>(value: T, delayMs = 250): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(value);
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return settled;
};
