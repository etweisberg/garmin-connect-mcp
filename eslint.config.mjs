import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": ["warn", { allow: ["error"] }],
    },
  },
  {
    files: ["src/test.ts"],
    rules: { "no-console": "off" },
  },
  { ignores: ["node_modules/**", "dist/**"] }
);
