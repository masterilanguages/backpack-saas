import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Next 14's `next lint` cannot load the ESLint 10 already installed here
// (it still passes the removed `useEslintrc` option). This flat config is
// what `npm run lint` and CI run. CI is report-only until the existing
// findings are cleaned up.
export default tseslint.config(
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "supabase/.temp/**"],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
);
