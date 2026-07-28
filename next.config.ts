import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone para a imagem Docker de produção
  output: "standalone",
  // Pacotes nativos usados apenas no servidor
  serverExternalPackages: ["@node-rs/argon2", "pino", "@react-pdf/renderer"],
};

export default nextConfig;
