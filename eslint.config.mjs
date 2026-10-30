import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  { ignores: [".next/**", ".next-e2e/**", ".tmp/**", "node_modules/**", "data/**", "next-env.d.ts"] },
];

export default config;
