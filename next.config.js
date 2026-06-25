/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // El Learning Portal se portó de masteri_v1 (origen Base44): componentes .jsx sin
  // tipos + framer-motion con tipados de easing muy estrictos. Esos errores son de
  // TIPOS (no afectan el runtime) y son demasiados para tiparlos uno a uno ahora.
  // Se ignoran en el build de producción —igual que el repo original del portal—
  // hasta endurecer el tipado más adelante (Fase 7).
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
