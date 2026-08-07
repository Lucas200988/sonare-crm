'use client';

import { useEffect, useRef } from 'react';

/**
 * Chuva de confete para quando um negócio é ganho.
 *
 * Feito à mão em canvas em vez de biblioteca: são poucas linhas, não entra
 * peso no pacote, e o comportamento fica sob controle — inclusive parar de
 * desenhar quando termina, em vez de deixar um laço rodando na aba aberta o
 * dia inteiro.
 */

type Particula = {
  x: number; y: number;
  vx: number; vy: number;
  giro: number; velGiro: number;
  largura: number; altura: number;
  cor: string;
};

/** Vermelho da marca ao lado de tons quentes, para o confete não ficar cinza. */
const CORES = ['#e22020', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15'];

const DURACAO_MS = 2600;
const GRAVIDADE = 0.14;
const ATRITO = 0.995;

function criarParticulas(largura: number, altura: number): Particula[] {
  const total = Math.min(160, Math.round(largura / 8));
  return Array.from({ length: total }, () => ({
    // saem de um pouco acima do topo, espalhadas na horizontal
    x: Math.random() * largura,
    y: -20 - Math.random() * altura * 0.4,
    vx: (Math.random() - 0.5) * 2.4,
    vy: 1.5 + Math.random() * 2.5,
    giro: Math.random() * Math.PI,
    velGiro: (Math.random() - 0.5) * 0.24,
    largura: 6 + Math.random() * 5,
    altura: 9 + Math.random() * 7,
    cor: CORES[Math.floor(Math.random() * CORES.length)],
  }));
}

export function Comemoracao({ aoTerminar }: { aoTerminar: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * O aviso de fim fica numa referência para a animação não ser reiniciada
   * quando a tela redesenha e passa uma função nova — o confete cairia do
   * topo de novo no meio da queda.
   */
  const terminar = useRef(aoTerminar);
  useEffect(() => { terminar.current = aoTerminar; }, [aoTerminar]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    /*
     * Quem pediu menos animação no sistema operacional não recebe confete —
     * movimento em tela cheia incomoda de verdade quem tem sensibilidade
     * vestibular. A comemoração vira só o aviso escrito.
     */
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const t = setTimeout(() => terminar.current(), 1800);
      return () => clearTimeout(t);
    }

    const dpr = window.devicePixelRatio || 1;
    const largura = window.innerWidth;
    const altura = window.innerHeight;
    canvas.width = largura * dpr;
    canvas.height = altura * dpr;
    ctx.scale(dpr, dpr);

    let particulas = criarParticulas(largura, altura);
    const inicio = performance.now();
    let frame = 0;

    function desenhar(agora: number) {
      const decorrido = agora - inicio;
      if (decorrido > DURACAO_MS) {
        terminar.current();
        return;
      }
      // some aos poucos no fim, para não sumir de uma vez
      const opacidade = decorrido > DURACAO_MS - 600
        ? (DURACAO_MS - decorrido) / 600
        : 1;

      ctx!.clearRect(0, 0, largura, altura);
      ctx!.globalAlpha = opacidade;

      for (const p of particulas) {
        p.vy += GRAVIDADE;
        p.vx *= ATRITO;
        p.x += p.vx;
        p.y += p.vy;
        p.giro += p.velGiro;

        ctx!.save();
        ctx!.translate(p.x, p.y);
        ctx!.rotate(p.giro);
        ctx!.fillStyle = p.cor;
        // o "papelzinho" some e reaparece conforme gira, dando volume
        ctx!.fillRect(-p.largura / 2, -p.altura / 2, p.largura, p.altura * Math.abs(Math.cos(p.giro)));
        ctx!.restore();
      }

      particulas = particulas.filter((p) => p.y < altura + 40);
      frame = requestAnimationFrame(desenhar);
    }

    frame = requestAnimationFrame(desenhar);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[60]"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
