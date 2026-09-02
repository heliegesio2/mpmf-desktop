import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // PGlite carrega WASM em runtime — não deixar o webpack empacotar
  serverExternalPackages: ["@electric-sql/pglite"],
  // garante que o .wasm/.data do PGlite entrem no standalone
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@electric-sql/pglite/dist/**"],
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
