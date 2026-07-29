/**
 * Gera o dicionário compacto de pt-BR usado pelo corretor ortográfico.
 *
 * Expande o dicionário hunspell (radical + regras de flexão → todas as formas)
 * e grava um filtro de Bloom em public/dicionario-pt-br.bloom. Roda uma vez;
 * o arquivo gerado é versionado para o build de produção não depender das
 * dependências de desenvolvimento.
 *
 * Uso: node scripts/gerar-dicionario.mjs
 */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Typo = require('typo-js');

// O filtro fica em src/server/spell para ser importável; reimplementado aqui
// em versão mínima porque este script roda fora do TypeScript.
const ASSINATURA = 0x534f4e42;

function fnv1a(texto, semente) {
  let h = semente;
  for (let i = 0; i < texto.length; i += 1) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function gravar(palavras, bits, hashes, destino) {
  const dados = new Uint8Array(Math.ceil(bits / 8));
  for (const palavra of palavras) {
    const a = fnv1a(palavra, 0x811c9dc5);
    const b = fnv1a(palavra, 0x9e3779b9) | 1;
    for (let i = 0; i < hashes; i += 1) {
      const pos = ((a + Math.imul(i, b)) >>> 0) % bits;
      dados[pos >>> 3] |= 1 << (pos & 7);
    }
  }
  const cabecalho = Buffer.alloc(12);
  cabecalho.writeUInt32BE(ASSINATURA, 0);
  cabecalho.writeUInt32BE(bits, 4);
  cabecalho.writeUInt32BE(hashes, 8);
  writeFileSync(destino, Buffer.concat([cabecalho, Buffer.from(dados)]));
}

console.log('Expandindo o dicionário hunspell (leva ~15 s)…');
const t0 = Date.now();
const typo = new Typo(
  'pt_BR',
  readFileSync('node_modules/dictionary-pt/index.aff', 'utf8'),
  readFileSync('node_modules/dictionary-pt/index.dic', 'utf8'),
);
console.log(`Expandido em ${((Date.now() - t0) / 1000).toFixed(1)} s.`);

// Minúsculas: a checagem em runtime também normaliza, então "Projeto" e
// "projeto" são a mesma entrada.
const palavras = new Set();
for (const forma of typo.dictionaryTable.keys()) {
  if (forma) palavras.add(forma.toLowerCase());
}
console.log(`${palavras.size.toLocaleString('pt-BR')} formas únicas.`);

// 1 falso positivo a cada 500 palavras é imperceptível no uso e mantém o
// arquivo pequeno o bastante para carregar no primeiro acesso.
const p = 1 / 500;
const n = palavras.size;
const bits = Math.ceil(-(n * Math.log(p)) / (Math.LN2 * Math.LN2));
const hashes = Math.max(1, Math.round((bits / n) * Math.LN2));

const destino = 'public/dicionario-pt-br.bloom';
gravar(palavras, bits, hashes, destino);
const mb = (statSync(destino).size / 1048576).toFixed(1);
console.log(`Gravado ${destino} (${mb} MB, ${hashes} hashes).`);
