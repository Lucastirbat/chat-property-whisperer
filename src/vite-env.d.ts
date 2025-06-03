/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANTHROPIC_API_KEY: string
  readonly VITE_APIFY_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
