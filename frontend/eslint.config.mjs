import { defineConfig } from "eslint/config";
import next from "eslint-config-next";

export default defineConfig([
  ...next(),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "warn",
      "@typescript-eslint/no-unused-vars": "warn"
    },
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "node_modules/**",
      "next-env.d.ts"
    ]
  }
]);