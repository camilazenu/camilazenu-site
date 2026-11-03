// Copies the static site into dist/ so node_modules, functions source and
// scripts are never published as public files.
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs"
const out = "dist"
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
const skip = new Set(["dist", "node_modules", "netlify", "scripts", ".git", ".netlify", "package.json", "package-lock.json", "netlify.toml", "README.md"])
for (const name of readdirSync(".")) {
  if (skip.has(name) || name.startsWith(".")) continue
  cpSync(name, `${out}/${name}`, { recursive: statSync(name).isDirectory() })
}
console.log("Static site copied to dist/")
