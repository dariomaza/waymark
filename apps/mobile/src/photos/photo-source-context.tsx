import { createContext, useContext, type JSX, type ReactNode } from "react";

import type { PhotoSource } from "./photo-source.js";

const PhotoSourceContext = createContext<PhotoSource | null>(null);

export const PhotoSourceProvider = ({
  source,
  children,
}: {
  readonly source: PhotoSource;
  readonly children: ReactNode;
}): JSX.Element => (
  <PhotoSourceContext.Provider value={source}>{children}</PhotoSourceContext.Provider>
);

export const usePhotoSource = (): PhotoSource => {
  const source = useContext(PhotoSourceContext);
  if (source === null) {
    throw new Error("usePhotoSource was called outside of a PhotoSourceProvider");
  }

  return source;
};
