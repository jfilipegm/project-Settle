// Types for check-build.mjs, so the tests can import it.

export const EXPECTED_ORT_WASM: string
export function checkBuild(dist: string): Promise<string[]>
