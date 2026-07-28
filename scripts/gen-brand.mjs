// Gera os assets de marca a partir dos PNGs oficiais no drive Z:.
// Uso: node scripts/gen-brand.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const dir = 'Z:/SONARE/Modelos Carimbo e timbrado/Material Gráfico 2021/Logos';
const src = (n) => `${dir}/sonare-engenharia.final-${n}.png`;
mkdirSync('public/brand', { recursive: true });

// Horizontal texto branco (menu lateral / login — fundos escuros)
await sharp(src('10')).trim().resize({ height: 160 }).png().toFile('public/brand/logo-horizontal-branco.png');
// Horizontal texto preto (cabeçalhos claros e PDFs)
await sharp(src('02')).trim().resize({ height: 160 }).png().toFile('public/brand/logo-horizontal-preto.png');
// Empilhado (capa de proposta)
await sharp(src('01')).trim().resize({ height: 400 }).png().toFile('public/brand/logo-empilhado.png');
// Símbolo
await sharp(src('06')).trim().resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile('public/brand/simbolo.png');
// Favicon do app (convenção Next: src/app/icon.png)
await sharp(src('06')).trim().resize({ width: 256, height: 256, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile('src/app/icon.png');

console.log('Assets gerados.');
