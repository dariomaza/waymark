import { queryKeys } from "@ariadna/api-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type JSX } from "react";

import { useApi } from "../api/api-context.js";
import "./authenticated-image.css";

export interface AuthenticatedImageProps {
  /** The path the API gave out, e.g. `/photos/abc/thumbnail`. */
  readonly src: string;
  readonly alt: string;
  readonly className?: string | undefined;
}

/**
 * # An `<img>` for a picture that needs a session
 *
 * `GET /photos/:id` is behind the bearer token like everything else, and for
 * good reason: these are the insides of a house on the public internet. A
 * plain `<img src>` cannot carry an `Authorization` header, so it would
 * answer 401 and draw a broken icon.
 *
 * So the bytes are fetched like any other request and handed to the DOM as an
 * object URL, which is revoked when the element goes away. The cost is that
 * the browser cannot stream the image into the decoder as it arrives; the
 * benefit is that photos are as private as the rest of the inventory, and
 * that the service worker can cache them under the same rules.
 */
export const AuthenticatedImage = ({
  src,
  alt,
  className,
}: AuthenticatedImageProps): JSX.Element => {
  const api = useApi();

  const bytes = useQuery({
    queryKey: queryKeys.photo(src),
    queryFn: async () => await api.fetchImage(src),
    // A stored file never changes once it is settled, and a photo that is
    // reprocessed gets a new set of bytes under the same id at most once.
    staleTime: 5 * 60 * 1000,
  });

  const objectUrl = useObjectUrl(bytes.data);

  if (objectUrl === null) {
    return (
      <span
        className={["photo photo--placeholder", className ?? ""].filter(Boolean).join(" ")}
        role="img"
        aria-label={bytes.isError ? `${alt} (could not be loaded)` : alt}
      />
    );
  }

  return <img className={["photo", className ?? ""].filter(Boolean).join(" ")} src={objectUrl} alt={alt} />;
};

/** Holds an object URL for as long as the element that shows it is alive. */
const useObjectUrl = (blob: Blob | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (blob === undefined) {
      setUrl(null);

      return undefined;
    }

    const created = URL.createObjectURL(blob);
    setUrl(created);

    return () => {
      // Without this every scroll through a gallery leaks a photo's worth of
      // memory, which on a phone is how a list of 200 items ends in a crash.
      URL.revokeObjectURL(created);
    };
  }, [blob]);

  return url;
};
