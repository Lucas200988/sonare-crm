/**
 * Filtro de Bloom — "esta palavra existe no dicionário?" em memória constante.
 *
 * O dicionário de português expandido tem 10,5 milhões de formas (151 MB em
 * texto). Guardar tudo é inviável; o filtro responde a mesma pergunta em ~17 MB.
 *
 * O erro possível é sempre na direção segura: o filtro pode dizer que uma
 * palavra existe quando não existe (uma em cada 500), então no máximo um erro
 * de digitação passa despercebido. Ele nunca diz que uma palavra correta está
 * errada — ou seja, nunca sublinha em vermelho o que está certo.
 */

/** Cabeçalho do arquivo: identifica o formato e guarda os parâmetros. */
const ASSINATURA = 0x534f4e42; // "SONB"

export type ParametrosBloom = {
  /** Total de bits. */
  bits: number;
  /** Quantidade de funções de hash. */
  hashes: number;
};

/**
 * Melhores parâmetros para `n` itens com probabilidade de falso positivo `p`.
 */
export function dimensionar(n: number, p: number): ParametrosBloom {
  const bits = Math.ceil(-(n * Math.log(p)) / (Math.LN2 * Math.LN2));
  const hashes = Math.max(1, Math.round((bits / n) * Math.LN2));
  return { bits, hashes };
}

/** FNV-1a de 32 bits, em duas variantes, para o esquema de duplo hash. */
function fnv1a(texto: string, semente: number): number {
  let h = semente;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    // multiplicação por 16777619 sem estourar o inteiro de 32 bits
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Posições de bit de uma palavra.
 *
 * Duplo hash (Kirsch–Mitzenmacher): duas funções bastam para simular k, sem
 * pagar k hashes independentes.
 */
function* posicoes(palavra: string, { bits, hashes }: ParametrosBloom) {
  const a = fnv1a(palavra, 0x811c9dc5);
  const b = fnv1a(palavra, 0x9e3779b9) | 1; // ímpar, para não repetir posições
  for (let i = 0; i < hashes; i += 1) {
    yield ((a + Math.imul(i, b)) >>> 0) % bits;
  }
}

export class FiltroBloom {
  readonly parametros: ParametrosBloom;
  private readonly dados: Uint8Array;

  constructor(parametros: ParametrosBloom, dados?: Uint8Array) {
    this.parametros = parametros;
    this.dados = dados ?? new Uint8Array(Math.ceil(parametros.bits / 8));
  }

  adicionar(palavra: string): void {
    for (const pos of posicoes(palavra, this.parametros)) {
      this.dados[pos >>> 3] |= 1 << (pos & 7);
    }
  }

  contem(palavra: string): boolean {
    for (const pos of posicoes(palavra, this.parametros)) {
      if ((this.dados[pos >>> 3] & (1 << (pos & 7))) === 0) return false;
    }
    return true;
  }

  /** Serializa com um cabeçalho de 12 bytes: assinatura, bits e hashes. */
  serializar(): Buffer {
    const cabecalho = Buffer.alloc(12);
    cabecalho.writeUInt32BE(ASSINATURA, 0);
    cabecalho.writeUInt32BE(this.parametros.bits, 4);
    cabecalho.writeUInt32BE(this.parametros.hashes, 8);
    return Buffer.concat([cabecalho, Buffer.from(this.dados)]);
  }

  static desserializar(buffer: Buffer): FiltroBloom {
    if (buffer.length < 12 || buffer.readUInt32BE(0) !== ASSINATURA) {
      throw new Error('Arquivo de dicionário inválido ou corrompido.');
    }
    const bits = buffer.readUInt32BE(4);
    const hashes = buffer.readUInt32BE(8);
    const dados = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset + 12,
      buffer.length - 12,
    );
    return new FiltroBloom({ bits, hashes }, dados);
  }
}
