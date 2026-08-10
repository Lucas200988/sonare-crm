import { describe, expect, it, vi, beforeAll } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
const { processarFoto } = await import('./fotos');

const TARJA = {
  empresa: 'SONARE Engenharia',
  projeto: 'ZZTESTE Usina',
  dataHora: '08/08/2026 14:37',
  codigoFoto: 'RDO-2026-999-001-F001',
  gps: 'GPS -15.598900, -56.094900',
};

/** Foto sintética de "obra": gradiente 2400×1600, jpeg. */
let original: Buffer;

beforeAll(async () => {
  original = await sharp({
    create: {
      width: 2400, height: 1600, channels: 3,
      background: { r: 180, g: 120, b: 60 },
    },
  }).jpeg({ quality: 90 }).toBuffer();
});

describe('processarFoto', () => {
  it('gera miniatura e visualização sem tocar no original', async () => {
    const antes = Buffer.from(original);
    const r = await processarFoto(original, TARJA);

    // o buffer de entrada permanece byte a byte igual
    expect(original.equals(antes)).toBe(true);
    expect(r.thumb.length).toBeGreaterThan(0);
    expect(r.view.length).toBeGreaterThan(0);
    // a miniatura é muito menor que o original
    expect(r.thumb.length).toBeLessThan(original.length / 4);
  });

  it('lê as dimensões do original', async () => {
    const r = await processarFoto(original, TARJA);
    expect(r.width).toBe(2400);
    expect(r.height).toBe(1600);
  });

  it('a visualização é reduzida ao teto e leva a tarja', async () => {
    const r = await processarFoto(original, TARJA);
    const meta = await sharp(r.view).metadata();
    expect(meta.width).toBeLessThanOrEqual(1600);

    // mesma redução sem tarja difere da versão com tarja — a tarja existe
    const semTarja = await sharp(original)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    expect(r.view.equals(semTarja)).toBe(false);
  });

  it('foto sem EXIF não tem data nem GPS inventados', async () => {
    const r = await processarFoto(original, TARJA);
    expect(r.exifDate).toBeNull();
    expect(r.exifGps).toBeNull();
  });

  it('caracteres especiais do projeto não quebram o SVG da tarja', async () => {
    const r = await processarFoto(original, {
      ...TARJA, projeto: 'Galpão <A> & Cia',
    });
    expect(r.view.length).toBeGreaterThan(0);
  });
});
