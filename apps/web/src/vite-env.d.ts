/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_DEFAULT_LOCALE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Версия платформы из корневого package.json, подставляется Vite при сборке. */
declare const __APP_VERSION__: string;

/** Короткий идентификатор коммита сборки, подставляется Vite при сборке. */
declare const __BUILD_ID__: string;
