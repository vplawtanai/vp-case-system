// Resolve the app's extensionless local TypeScript imports in Node's test runner.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try { return nextResolve(specifier, context); }
    catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".") || !context.parentURL?.startsWith("file:")) throw error;
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context);
      }
      throw error;
    }
  },
});
