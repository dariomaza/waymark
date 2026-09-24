import { useState, type JSX } from "react";
import { Image, StyleSheet, View } from "react-native";

import { useApi } from "../api/api-context.js";
import { useSessionStore } from "../auth/session-context.js";
import { useTranslate } from "../app/language-context.js";
import { colors, radius } from "../ui/styles/tokens.js";

export interface AuthenticatedImageProps {
  /** The path the API gave out, e.g. `/photos/abc/thumbnail`. */
  readonly src: string;
  /**
   * What the picture SAYS. Empty means it says nothing the surrounding text
   * does not — a cover photo inside a card named after the thing — and the
   * image is then hidden from assistive technology rather than announced as
   * an unlabelled one.
   */
  readonly alt: string;
  readonly size?: number;
  /**
   * Fills whatever box it is given instead of being a square of `size`.
   *
   * For a grid cell, whose width is a third of the phone rather than a number
   * this component could know.
   */
  readonly fill?: boolean;
}

/**
 * # An image for a picture that needs a session
 *
 * `GET /photos/:id` is behind the bearer token like everything else, and for
 * good reason: these are the insides of a house on the public internet.
 *
 * The web client cannot put a header on an `<img>`, so it fetches the bytes
 * and hands the DOM an object URL. React Native's `Image` takes headers
 * directly, which is better in the way that matters on a phone: the bytes go
 * from the socket to the native decoder without the whole photo passing
 * through the JavaScript heap, and a scroll through a gallery of twenty does
 * not have twenty photos resident at once.
 *
 * The path is whatever the API put in `photo.url`. Nothing here builds one.
 *
 * # When it does not arrive
 *
 * A grey square says nothing. Was it this photo, the token, or the server? On
 * a garage's worth of signal that question gets asked, so a picture that fails
 * keeps its box and takes the failure's NAME — "{name} (could not be loaded)",
 * which is what the web client's error branch has always said. The name is
 * inside the sentence rather than read out before it, because a gallery of
 * twelve failures that all say "could not be loaded" is one sentence twelve
 * times.
 *
 * A picture with no name of its own stays silent when it fails, for the same
 * reason it is silent when it works: the text beside it already said what it
 * is, and "(could not be loaded)" with nothing in front of it names nothing.
 */
export const AuthenticatedImage = ({
  src,
  alt,
  size = 96,
  fill = false,
}: AuthenticatedImageProps): JSX.Element => {
  const t = useTranslate();

  const api = useApi();
  const token = useSessionStore().token();

  /**
   * The src it failed on, rather than a bare flag: a photo that is reprocessed
   * arrives at a new address, and a flag would leave the new bytes wearing the
   * old failure's name until the screen was thrown away.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const shape = fill ? styles.filling : [styles.photo, { width: size, height: size }];

  if (failedSrc === src) {
    return (
      <View
        accessible={alt !== ""}
        importantForAccessibility={alt === "" ? "no-hide-descendants" : "yes"}
        {...(alt === ""
          ? {}
          : {
              accessibilityLabel: t("photos.couldNotLoad", { name: alt }),
              accessibilityRole: "image" as const,
            })}
        style={shape}
      />
    );
  }

  return (
    <Image
      accessible={alt !== ""}
      importantForAccessibility={alt === "" ? "no-hide-descendants" : "yes"}
      {...(alt === "" ? {} : { accessibilityLabel: alt, accessibilityRole: "image" as const })}
      resizeMode="cover"
      source={{
        uri: api.absoluteUrl(src),
        ...(token === null ? {} : { headers: { Authorization: `Bearer ${token}` } }),
      }}
      onError={() => {
        setFailedSrc(src);
      }}
      style={shape}
    />
  );
};

const styles = StyleSheet.create({
  photo: {
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSunken,
  },
  // No corner of its own: the box it fills already has one and clips to it.
  filling: { width: "100%", height: "100%", backgroundColor: colors.surfaceSunken },
});
