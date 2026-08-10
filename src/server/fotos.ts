import 'server-only';
import sharp from 'sharp';

/**
 * Processamento das fotos de obra.
 *
 * Regra inegociável: o original nunca é alterado. Daqui saem apenas cópias —
 * a miniatura da galeria e a versão de visualização com a tarja de
 * identificação que vai para o RDO em PDF.
 */

const THUMB_PX = 320;
const VIEW_PX = 1600;

export type FotoProcessada = {
  thumb: Buffer;
  view: Buffer;
  width: number | null;
  height: number | null;
  /** Data de captura lida do EXIF, quando o arquivo trouxe. */
  exifDate: Date | null;
  /** GPS lido do EXIF, quando presente (fotos importadas da galeria). */
  exifGps: { lat: number; lng: number } | null;
};

export type TarjaInfo = {
  empresa: string;
  projeto: string;
  dataHora: string;
  codigoFoto: string;
  gps: string | null;
};

/** Escapa o que vai dentro do SVG da tarja. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Tarja discreta no rodapé da cópia de visualização.
 *
 * Fica na cópia — nunca no original — e identifica a evidência mesmo quando
 * a imagem é extraída do PDF e circula solta por e-mail.
 */
function svgTarja(largura: number, info: TarjaInfo): Buffer {
  const altura = 46;
  const linha1 = `${info.empresa} · ${info.projeto} · ${info.codigoFoto}`;
  const linha2 = [info.dataHora, info.gps].filter(Boolean).join(' · ');
  return Buffer.from(`<svg width="${largura}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="black" fill-opacity="0.55"/>
  <text x="10" y="18" font-family="Arial, sans-serif" font-size="13" fill="white" font-weight="bold">${esc(linha1)}</text>
  <text x="10" y="36" font-family="Arial, sans-serif" font-size="12" fill="white">${esc(linha2)}</text>
</svg>`);
}

/** Converte a coordenada EXIF (graus/minutos/segundos + referência) em decimal. */
function gpsDecimal(
  dms: number[] | undefined, ref: string | undefined,
): number | null {
  if (!dms || dms.length < 3) return null;
  const dec = dms[0] + dms[1] / 60 + dms[2] / 3600;
  if (!Number.isFinite(dec)) return null;
  return ref === 'S' || ref === 'W' ? -dec : dec;
}

/**
 * Gera as derivadas e lê os metadados.
 *
 * `rotate()` sem argumento aplica a orientação EXIF — sem isso, foto tirada
 * na vertical aparece deitada na galeria e no PDF.
 */
export async function processarFoto(
  original: Buffer, tarja: TarjaInfo,
): Promise<FotoProcessada> {
  const base = sharp(original, { failOn: 'none' });
  const meta = await base.metadata();

  // EXIF: data de captura e GPS, quando o arquivo trouxe
  let exifDate: Date | null = null;
  let exifGps: { lat: number; lng: number } | null = null;
  if (meta.exif) {
    try {
      const { default: exifReader } = await import('exif-reader');
      const exif = exifReader(meta.exif);
      const dt = exif?.Photo?.DateTimeOriginal ?? exif?.Image?.DateTime;
      if (dt instanceof Date && !Number.isNaN(dt.getTime())) exifDate = dt;
      const lat = gpsDecimal(
        exif?.GPSInfo?.GPSLatitude as number[] | undefined,
        exif?.GPSInfo?.GPSLatitudeRef as string | undefined,
      );
      const lng = gpsDecimal(
        exif?.GPSInfo?.GPSLongitude as number[] | undefined,
        exif?.GPSInfo?.GPSLongitudeRef as string | undefined,
      );
      if (lat !== null && lng !== null) exifGps = { lat, lng };
    } catch {
      // EXIF corrompido não derruba a foto
    }
  }

  const thumb = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize(THUMB_PX, THUMB_PX, { fit: 'cover' })
    .jpeg({ quality: 70 })
    .toBuffer();

  // redimensiona primeiro para saber a largura final da tarja
  const reduzida = await sharp(original, { failOn: 'none' })
    .rotate()
    .resize(VIEW_PX, VIEW_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  const dimensoes = await sharp(reduzida).metadata();
  const largura = dimensoes.width ?? VIEW_PX;
  const altura = dimensoes.height ?? VIEW_PX;

  const view = await sharp(reduzida)
    .composite([{ input: svgTarja(largura, tarja), top: altura - 46, left: 0 }])
    .jpeg({ quality: 82 })
    .toBuffer();

  return {
    thumb,
    view,
    width: meta.width ?? null,
    height: meta.height ?? null,
    exifDate,
    exifGps,
  };
}
