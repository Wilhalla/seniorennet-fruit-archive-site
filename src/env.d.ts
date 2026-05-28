/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_S3_ASSET_BASE_URL?: string
  readonly PUBLIC_S3_ASSET_ENDPOINT?: string
  readonly PUBLIC_S3_ASSET_BUCKET?: string
  readonly PUBLIC_S3_ASSET_PREFIX?: string
  readonly PUBLIC_USE_REMOTE_IMAGE_ASSETS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
