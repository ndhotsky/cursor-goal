import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import path from "node:path"

const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json")

export const PACKAGE_VERSION = (JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version: string })
  .version
