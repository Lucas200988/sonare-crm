/**
 * Geração de CSV para abrir no Excel brasileiro.
 *
 * O Excel em pt-BR usa ponto e vírgula como separador (porque a vírgula é o
 * decimal) e precisa do BOM UTF-8 para não estropiar os acentos.
 */

export type Coluna<T> = {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
};

/** Escapa o campo: aspas duplicadas e cerca quando há separador ou quebra. */
function campo(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor);
  if (/[;"\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

export function gerarCsv<T>(linhas: T[], colunas: Coluna<T>[]): string {
  const cabecalho = colunas.map((c) => campo(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => campo(c.valor(l))).join(';'));
  // \r\n é o fim de linha que o Excel espera
  return [cabecalho, ...corpo].join('\r\n');
}

/** Número no formato que o Excel pt-BR entende como número, não texto. */
export function numeroCsv(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  return String(valor).replace('.', ',');
}

/** Resposta pronta para download, com BOM e nome de arquivo datado. */
export function respostaCsv(conteudo: string, nomeBase: string): Response {
  const hoje = new Date().toISOString().slice(0, 10);
  const bom = '﻿';
  return new Response(bom + conteudo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeBase}-${hoje}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
