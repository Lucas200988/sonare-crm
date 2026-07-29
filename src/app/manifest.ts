import type { MetadataRoute } from 'next';

/**
 * Torna o sistema instalável no celular (PWA).
 *
 * No Android e no iOS, "Adicionar à tela de início" cria um ícone que abre em
 * tela cheia, sem a barra do navegador — a experiência fica de aplicativo sem
 * exigir publicação nas lojas.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SONARE CRM',
    short_name: 'SONARE',
    description: 'Sistema de gestão comercial, técnica e financeira da SONARE Engenharia',
    start_url: '/dashboard',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#020617',
    theme_color: '#020617',
    lang: 'pt-BR',
    icons: [
      { src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
      { src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
