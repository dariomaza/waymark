/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The API's origin, as seen from a browser. See `.env.example`. */
  readonly VITE_WAYMARK_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
