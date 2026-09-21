import type { JSX } from "react";
import { Image, StyleSheet } from "react-native";

import { useApi } from "../api/api-context.js";
import { useSessionStore } from "../auth/session-context.js";
import { colors, radius } from "../ui/styles/tokens.js";

export interface AuthenticatedImageProps {
  /** The path the API gave out, e.g. `/photos/abc/thumbnail`. */
  readonly src: string;
  readonly alt: string;
  readonly size?: number;
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
 */
export const AuthenticatedImage = ({
  src,
  alt,
  size = 96,
}: AuthenticatedImageProps): JSX.Element => {
  const api = useApi();
  const token = useSessionStore().token();

  return (
    <Image
      accessibilityLabel={alt}
      accessibilityRole="image"
      source={{
        uri: api.absoluteUrl(src),
        ...(token === null ? {} : { headers: { Authorization: `Bearer ${token}` } }),
      }}
      style={[styles.photo, { width: size, height: size }]}
    />
  );
};

const styles = StyleSheet.create({
  photo: {
    borderRadius: radius.m,
    backgroundColor: colors.surfaceSunken,
  },
});
