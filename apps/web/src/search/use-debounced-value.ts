import { useEffect, useState } from "react";

/**
 * Search runs as you type, and every keystroke would otherwise be a request
 * over a home connection from a phone. A quarter of a second is long enough
 * that a word typed at speed costs one query, and short enough that the
 * results feel like they are keeping up.
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
