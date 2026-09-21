import type { ComponentType } from "react";

/**
 * # The camera, behind a port
 *
 * Reading a QR from a live camera is the one thing in this app that cannot be
 * driven from a test: a test runner has no lens, no camera permission and no
 * pixels. So the camera is a port, and the `expo-camera` adapter behind it is
 * the only file in the app that knows what a capture device is.
 *
 * It is a COMPONENT rather than a `start(...)` call, which is where this
 * differs from the web client's port. On the web a camera is a stream you push
 * into a `<video>` you already have; in React Native it is a native view that
 * owns its own lifecycle, and a port that pretended otherwise would have to
 * invent a handle to a view it does not hold.
 *
 * This is not the same as stubbing the app's own code. What is stood in for is
 * hardware and a permission dialog, genuinely outside — while everything the
 * scan screen then DOES with a decoded string is the real code, the real
 * router and the real API through the HTTP stub.
 */
export interface CodeScannerViewProps {
  /** Called for every symbol read, with whatever the symbol encodes. */
  readonly onCode: (text: string) => void;
}

export interface CodeScanner {
  readonly View: ComponentType<CodeScannerViewProps>;
}
