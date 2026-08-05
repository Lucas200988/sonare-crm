import 'server-only';
import {
  aplicarLimite, tipoAceito, TAMANHO_MAXIMO_BYTES, type TextoExtraido,
} from '@/lib/documento-limites';

/**
 * Texto de um termo de referência, edital ou memorial anexado.
 *
 * O arquivo não é guardado: só o texto entra no briefing da IA. Guardar o
 * documento seria outro assunto (anexo do orçamento), com outras regras de
 * retenção — e ninguém pediu isso.
 */

export type ResultadoExtracao =
  | { erro: string }
  | (TextoExtraido & { nome: string });

/** Lê o texto de um PDF, página por página. */
async function doPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

/** Lê o texto de um .docx, descartando formatação. */
async function doDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

export async function extrairTexto(arquivo: File): Promise<ResultadoExtracao> {
  if (arquivo.size === 0) return { erro: 'O arquivo está vazio.' };
  if (arquivo.size > TAMANHO_MAXIMO_BYTES) {
    return { erro: 'Arquivo acima de 15 MB. Envie só a parte que descreve o serviço.' };
  }
  if (!tipoAceito(arquivo.type, arquivo.name)) {
    return { erro: 'Formato não suportado. Envie PDF, Word (.docx) ou texto.' };
  }

  try {
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const nome = arquivo.name.toLowerCase();

    let bruto: string;
    if (nome.endsWith('.pdf') || arquivo.type === 'application/pdf') {
      bruto = await doPdf(new Uint8Array(buffer));
    } else if (nome.endsWith('.docx')) {
      bruto = await doDocx(buffer);
    } else {
      bruto = buffer.toString('utf8');
    }

    const extraido = aplicarLimite(bruto);
    if (extraido.texto.length < 30) {
      // PDF de digitalização não tem camada de texto — vale dizer isso, em
      // vez de mandar duas linhas de nada para a IA
      return {
        erro: 'Não foi possível ler texto deste arquivo. '
          + 'Se for um PDF digitalizado (imagem), converta-o para texto antes de enviar.',
      };
    }

    return { ...extraido, nome: arquivo.name };
  } catch (e) {
    console.error('[extração] falhou:', e instanceof Error ? e.message : e);
    return { erro: 'Não foi possível ler o arquivo. Confira se ele abre normalmente.' };
  }
}
