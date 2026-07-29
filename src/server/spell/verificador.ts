import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { FiltroBloom } from './bloom';

/**
 * Verificação ortográfica de pt-BR no servidor.
 *
 * O dicionário é um filtro de Bloom gerado no build (scripts/gerar-dicionario.mjs)
 * a partir do VERO, o mesmo dicionário do LibreOffice. As sugestões saem do
 * método clássico de edições: gera as variações a 1 tecla de distância da
 * palavra errada e devolve as que existem no dicionário.
 */

let filtro: FiltroBloom | null = null;

function getFiltro(): FiltroBloom {
  if (!filtro) {
    const arquivo = path.join(process.cwd(), 'public', 'dicionario-pt-br.bloom');
    filtro = FiltroBloom.desserializar(readFileSync(arquivo));
  }
  return filtro;
}

/** Letras usadas nas variações — inclui as acentuadas do português. */
const LETRAS = 'abcdefghijklmnopqrstuvwxyzáàâãéêíóôõúüç'.split('');

/**
 * Siglas do setor e termos que o VERO não conhece mas são corretos aqui.
 * Minúsculas: a comparação normaliza a caixa.
 */
const TERMOS_PROPRIOS = new Set([
  'sonare', 'cuiabá', 'spda', 'qgbt', 'ufv', 'bess', 'nobreak', 'nobreaks',
  'string', 'strings', 'inversor', 'inversores', 'kwp', 'kva', 'kwh',
  'unifilar', 'unifilares', 'multifilar', 'multifilares', 'trifilar',
  'as-built', 'layout', 'layouts', 'checklist', 'checklists', 'kit', 'kits',
  'software', 'softwares', 'hardware', 'e-mail', 'e-mails', 'site', 'sites',
  'online', 'offline', 'backup', 'backups', 'nf-e', 'nfs-e', 'issnet',
]);

export function palavraExiste(palavra: string): boolean {
  const p = palavra.toLowerCase();
  return TERMOS_PROPRIOS.has(p) || getFiltro().contem(p);
}

/** Variações a uma edição de distância (remoção, troca, transposição, inserção). */
function edicoes(palavra: string): Set<string> {
  const variacoes = new Set<string>();
  for (let i = 0; i <= palavra.length; i += 1) {
    const antes = palavra.slice(0, i);
    const depois = palavra.slice(i);
    if (depois) variacoes.add(antes + depois.slice(1)); // remoção
    if (depois.length > 1) {
      variacoes.add(antes + depois[1] + depois[0] + depois.slice(2)); // transposição
    }
    for (const letra of LETRAS) {
      variacoes.add(antes + letra + depois); // inserção
      if (depois) variacoes.add(antes + letra + depois.slice(1)); // troca
    }
  }
  variacoes.delete(palavra);
  return variacoes;
}

/**
 * Sugestões para uma palavra errada, em ordem de plausibilidade.
 *
 * Primeiro as variações que só diferem em acento (o erro mais comum ao
 * digitar rápido), depois as demais a uma edição de distância.
 */
export function sugerir(palavra: string, maximo = 5): string[] {
  const p = palavra.toLowerCase();
  const candidatas = [...edicoes(p)].filter((v) => v.length >= 2 && palavraExiste(v));

  const semAcento = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '');
  const base = semAcento(p);
  candidatas.sort((a, b) => {
    const aAcento = semAcento(a) === base ? 0 : 1;
    const bAcento = semAcento(b) === base ? 0 : 1;
    if (aAcento !== bAcento) return aAcento - bAcento;
    return a.localeCompare(b, 'pt-BR');
  });

  // Devolve com a caixa da palavra original ("Servico" → "Serviço")
  const maiuscula = /^[A-ZÀ-Ü]/.test(palavra);
  return candidatas
    .slice(0, maximo)
    .map((s) => (maiuscula ? s.charAt(0).toUpperCase() + s.slice(1) : s));
}

/**
 * Verifica um lote de palavras e devolve apenas as erradas, cada uma com as
 * sugestões. Uma resposta vazia significa que está tudo certo.
 */
export function verificarLote(palavras: string[]): Record<string, string[]> {
  const erradas: Record<string, string[]> = {};
  // limite defensivo: o cliente manda palavras novas aos poucos
  for (const palavra of palavras.slice(0, 300)) {
    if (!palavraExiste(palavra)) erradas[palavra] = sugerir(palavra);
  }
  return erradas;
}
