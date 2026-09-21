import { useEffect, type JSX } from "react";
import { Text, View } from "react-native";

import type { CodeScanner, CodeScannerViewProps } from "../scanning/code-scanner.js";

export interface FakeScanner extends CodeScanner {
  /** Hands the screen whatever a symbol would have encoded. */
  scan(text: string): void;
}

/**
 * The camera, for a runner that has no lens.
 *
 * It stands in for the hardware and nothing else: the string it emits goes
 * through the real parser, the real navigator and the real forest lookup, and
 * lands on the real unit screen answered by the HTTP stub.
 */
export const fakeScanner = (): FakeScanner => {
  let emit: ((text: string) => void) | null = null;

  const View_ = ({ onCode }: CodeScannerViewProps): JSX.Element => {
    useEffect(() => {
      emit = onCode;

      return () => {
        emit = null;
      };
    }, [onCode]);

    return (
      <View accessibilityLabel="Camera">
        <Text>Camera</Text>
      </View>
    );
  };

  return {
    View: View_,
    scan(text) {
      if (emit === null) {
        throw new Error("Nothing is looking through the camera right now");
      }

      emit(text);
    },
  };
};
