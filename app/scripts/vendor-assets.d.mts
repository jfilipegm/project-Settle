// Types for vendor-assets.mjs, so the tests can import it.

export interface VendorCopy {
  from: string
  to: string
}

export interface VendorPackage {
  name: string
  license: string
  source: string
  licenseFiles: VendorCopy[]
}

export const VENDOR_FILES: VendorCopy[]
export const VENDOR_DIRECTORIES: VendorCopy[]
export const VENDOR_PACKAGES: VendorPackage[]
export const BUNDLED_PACKAGES: VendorPackage[]
export const GENERATED_NOTICES: { to: string; text: string }[]

export function packageVersion(
  nodeModules: string,
  name: string,
): Promise<string>

export function vendorAssets(options: {
  nodeModules: string
  outDir: string
}): Promise<string[]>
