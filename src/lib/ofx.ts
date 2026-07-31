/**
 * Leitura de extrato bancário no formato OFX.
 *
 * OFX é o formato de exportação que todo internet banking brasileiro oferece.
 * Os bancos geram variantes — SGML sem tags de fechamento (Sicoob, BB) ou XML
 * completo (Itaú) — e este parser aceita as duas, lendo apenas o que a
 * conciliação usa: identificador, data, valor e descrição de cada transação.
 */

export type TransacaoOfx = {
  /** FITID — identificador único da transação no banco; evita reimportar. */
  fitId: string;
  postedAt: Date;
  /** Positivo = entrada, negativo = saída, como no extrato. */
  amount: number;
  memo: string | null;
};

/** Valor de uma tag OFX dentro de um bloco (com ou sem tag de fechamento). */
function tag(bloco: string, nome: string): string | null {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i').exec(bloco);
  const valor = m?.[1]?.trim();
  return valor ? valor : null;
}

/** DTPOSTED vem como 20260731 ou 20260731120000[-3:BRT]; só a data importa. */
function dataOfx(bruta: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(bruta);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** TRNAMT usa ponto decimal, mas alguns bancos mandam vírgula. */
function valorOfx(bruto: string): number | null {
  const n = Number(bruto.replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function parseOfx(conteudo: string): TransacaoOfx[] {
  const transacoes: TransacaoOfx[] = [];
  // cada transação vive num bloco <STMTTRN>…</STMTTRN> (ou até o próximo <STMTTRN>)
  const blocos = conteudo.split(/<STMTTRN>/i).slice(1);

  for (const brutoBloco of blocos) {
    const bloco = brutoBloco.split(/<\/STMTTRN>/i)[0];
    const fitId = tag(bloco, 'FITID');
    const data = tag(bloco, 'DTPOSTED');
    const valor = tag(bloco, 'TRNAMT');
    if (!fitId || !data || !valor) continue;

    const postedAt = dataOfx(data);
    const amount = valorOfx(valor);
    if (!postedAt || amount === null) continue;

    transacoes.push({
      fitId,
      postedAt,
      amount,
      memo: tag(bloco, 'MEMO') ?? tag(bloco, 'NAME'),
    });
  }
  return transacoes;
}
