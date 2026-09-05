import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    rules: {
      "no-unused-vars": "off"
    },
    ignores: [
      "dist/**",
      "node_modules/**",
      "*.d.ts"
    ]
  }
]);