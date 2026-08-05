import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const { extrairTexto } = await import('./extrair-documento');

/** PDF mínimo, válido, com uma linha de texto — para exercitar a extração real. */
function pdfCom(texto: string): Buffer {
  const conteudo = `BT /F1 12 Tf 40 700 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R'
      + ' /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function arquivo(conteudo: Buffer | string, nome: string, tipo: string): File {
  return new File([conteudo as unknown as BlobPart], nome, { type: tipo });
}

describe('extrairTexto', () => {
  it('lê o texto de um PDF', async () => {
    const frase = 'TERMO DE REFERENCIA - Projeto eletrico da subestacao de 300 kVA.';
    const r = await extrairTexto(arquivo(pdfCom(frase), 'termo.pdf', 'application/pdf'));

    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(r.texto).toContain('subestacao');
    expect(r.nome).toBe('termo.pdf');
    expect(r.cortado).toBe(false);
  });

  it('lê arquivo de texto simples', async () => {
    const conteudo = 'Objeto: elaboracao de projeto eletrico executivo para galpao industrial.';
    const r = await extrairTexto(arquivo(conteudo, 'briefing.txt', 'text/plain'));

    expect('erro' in r).toBe(false);
    if ('erro' in r) return;
    expect(r.texto).toContain('galpao industrial');
  });

  it('recusa formato que não sabemos ler', async () => {
    const r = await extrairTexto(arquivo('conteudo', 'planta.dwg', 'application/acad'));
    expect('erro' in r && r.erro).toContain('Formato não suportado');
  });

  it('recusa arquivo vazio', async () => {
    const r = await extrairTexto(arquivo('', 'vazio.txt', 'text/plain'));
    expect('erro' in r && r.erro).toContain('vazio');
  });

  it('avisa quando o PDF não tem camada de texto', async () => {
    /*
     * É o caso do documento digitalizado. Sem este aviso, duas linhas de
     * nada iriam para a IA e o escopo sairia inventado.
     */
    const r = await extrairTexto(arquivo(pdfCom('oi'), 'digitalizado.pdf', 'application/pdf'));
    expect('erro' in r && r.erro).toContain('PDF digitalizado');
  });
});
