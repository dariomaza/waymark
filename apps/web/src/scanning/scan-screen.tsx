import { publicIdFromScannedText } from "@ariadna/api-client";
import { useEffect, useRef, useState, type FormEvent, type JSX } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../ui/atoms/button.js";
import { Callout } from "../ui/atoms/callout.js";
import { TextField } from "../ui/atoms/text-field.js";
import { useScanner } from "./scanner-context.js";

import "./scan-screen.css";
import { scannedLabelPath } from "../app/routes.js";

/**
 * # Scanning from inside the app
 *
 * The stock camera already opens `/u/<publicId>` (see
 * `scanned-label-screen.tsx`), and that is the path for somebody holding a
 * phone and a box for the first time. This screen is for the other half of
 * the job: standing in front of a shelf, scanning one label after another,
 * without leaving the app between each.
 *
 * Whatever is decoded goes through the same front door as a scanned URL, so
 * there is exactly one place that turns a code into a unit.
 */
export const ScanScreen = (): JSX.Element => {
  const scanner = useScanner();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const [cameraProblem, setCameraProblem] = useState<string | null>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    const element = video.current;
    if (element === null) {
      return undefined;
    }

    let stop: (() => void) | null = null;
    let cancelled = false;

    void scanner
      .start(element, (text) => {
        const code = publicIdFromScannedText(text);
        if (code === null) {
          setUnknownCode(text);

          return;
        }

        navigate(scannedLabelPath(code), { replace: true });
      })
      .then((stopCamera) => {
        if (cancelled) {
          stopCamera();
        } else {
          stop = stopCamera;
        }
      })
      .catch((cause: unknown) => {
        setCameraProblem(String(cause));
      });

    return () => {
      cancelled = true;
      // The camera light stays on until somebody turns it off.
      stop?.();
    };
  }, [scanner, navigate]);

  const openTyped = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const code = publicIdFromScannedText(typed);
    if (code === null) {
      setUnknownCode(typed);

      return;
    }

    navigate(scannedLabelPath(code));
  };

  return (
    <main className="screen">
      <h2>Scan a label</h2>

      {cameraProblem === null ? (
        <video className="scan__video" ref={video} muted playsInline aria-label="Camera" />
      ) : (
        <Callout tone="blocked" title="The camera could not be started">
          <p>
            Ariadna needs permission to use the camera, and the page has to be
            served over HTTPS. Either way, the code printed under the symbol works
            just as well.
          </p>
        </Callout>
      )}

      {unknownCode === null ? null : (
        <Callout tone="wrong">
          That is not an Ariadna label. A label points at this app and ends in a
          ten character code.
        </Callout>
      )}

      <form className="scan__by-hand" onSubmit={openTyped}>
        <TextField
          id="scan-code"
          label="Or the code printed under the symbol"
          value={typed}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
        />
        <Button type="submit" tone="primary">
          Open that unit
        </Button>
      </form>
    </main>
  );
};
