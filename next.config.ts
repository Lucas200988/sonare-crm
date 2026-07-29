import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build standalone para a imagem Docker de produção
  output: "standalone",
  // Pacotes nativos usados apenas no servidor
  serverExternalPackages: ["@node-rs/argon2", "pino", "@react-pdf/renderer"],
  // O dicionário é lido com readFileSync em caminho calculado; sem isto o
  // rastreador de arquivos não o incluiria no pacote da função na Vercel
  outputFileTracingIncludes: {
    "/api/ortografia": ["./public/dicionario-pt-br.bloom"],
  },
};

export default nextConfig;
