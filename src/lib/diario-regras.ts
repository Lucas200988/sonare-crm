/**
 * Regras do Diário de Obras que não dependem de banco nem de tela.
 *
 * Ficam aqui porque são as que decidem coisas com consequência: se o registro
 * foi feito na obra, qual o número do documento, e o que falta antes de
 * fechar o dia. O resto do módulo é transporte.
 */

// ---------- Localização ----------

const RAIO_TERRA_M = 6_371_000;

/** Distância em metros entre duas coordenadas (haversine). */
export function distanciaMetros(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.asin(Math.sqrt(a));
}

export type ClasseLocal = 'DENTRO' | 'PROXIMO' | 'FORA' | 'INDISPONIVEL';

/**
 * Classifica o registro em relação à área da obra.
 *
 * "Próximo" existe porque GPS urbano erra por dezenas de metros e o
 * estacionamento fica fora da cerca — tratar isso como "fora" geraria
 * alerta falso todo dia. Nada aqui bloqueia o registro: a classificação é
 * rastreabilidade, não catraca.
 */
export function classificarLocal(
  registro: { lat: number | null; lng: number | null },
  obra: { lat: number | null; lng: number | null; raioM: number | null },
): { classe: ClasseLocal; distanciaM: number | null } {
  if (registro.lat === null || registro.lng === null) {
    return { classe: 'INDISPONIVEL', distanciaM: null };
  }
  if (obra.lat === null || obra.lng === null) {
    // sem geofence cadastrada não há com o que comparar
    return { classe: 'INDISPONIVEL', distanciaM: null };
  }
  const raio = obra.raioM ?? 500;
  const d = distanciaMetros(registro.lat, registro.lng, obra.lat, obra.lng);
  if (d <= raio) return { classe: 'DENTRO', distanciaM: Math.round(d) };
  if (d <= raio * 3) return { classe: 'PROXIMO', distanciaM: Math.round(d) };
  return { classe: 'FORA', distanciaM: Math.round(d) };
}

/** Texto curto da classificação, para a tela e para o PDF. */
export function textoDoLocal(classe: ClasseLocal, distanciaM: number | null): string {
  switch (classe) {
    case 'DENTRO': return 'Localização confirmada na obra';
    case 'PROXIMO': return `Registrado a ${formatarDistancia(distanciaM)} do centro da obra`;
    case 'FORA': return `Registrado a ${formatarDistancia(distanciaM)} do local cadastrado da obra`;
    default: return 'Localização não disponível';
  }
}

function formatarDistancia(m: number | null): string {
  if (m === null) return 'distância desconhecida';
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

// ---------- Numeração ----------

/**
 * Código do diário: RDO-ANO-PROJETO-SEQ (ex.: RDO-2026-004-001).
 *
 * O trecho do projeto vem do próprio código dele (PRJ-2026-004 → 004), para
 * o RDO ser encontrável a partir do papel sem consultar o sistema.
 */
export function codigoDiario(projectCode: string, ano: number, seq: number): string {
  const sufixo = projectCode.split('-').pop() ?? projectCode;
  return `RDO-${ano}-${sufixo}-${String(seq).padStart(3, '0')}`;
}

/** Código de uma foto dentro do diário: RDO-…-F007. */
export function codigoFoto(codigoDoDiario: string, seq: number): string {
  return `${codigoDoDiario}-F${String(seq).padStart(3, '0')}`;
}

// ---------- Fechamento ----------

export type ResumoParaFechar = {
  atividades: number;
  equipes: number;
  equipamentos: number;
  fotos: number;
  fotosSemCategoria: number;
  ocorrenciasSemResponsavel: number;
  impedimentosAbertos: number;
};

/**
 * O que falta antes de fechar o dia.
 *
 * Nenhum item impede o fechamento — obra fecha com o que tem. Mas o aviso
 * ignorado fica registrado, porque "ninguém informou a equipe" lido três
 * meses depois numa discussão contratual é informação, não esquecimento.
 */
export function pendenciasDoFechamento(r: ResumoParaFechar): string[] {
  const avisos: string[] = [];
  if (r.atividades === 0) avisos.push('Nenhuma atividade foi registrada.');
  if (r.equipes === 0) avisos.push('Nenhuma equipe foi informada.');
  if (r.fotosSemCategoria > 0) {
    avisos.push(`${r.fotosSemCategoria} foto(s) sem classificação.`);
  }
  if (r.ocorrenciasSemResponsavel > 0) {
    avisos.push(`${r.ocorrenciasSemResponsavel} ocorrência(s) sem responsável.`);
  }
  if (r.impedimentosAbertos > 0) {
    avisos.push(`${r.impedimentosAbertos} impedimento(s) sem previsão de solução.`);
  }
  return avisos;
}

// ---------- Data do diário ----------

/**
 * O "dia" do diário no fuso da obra (America/Cuiaba), como YYYY-MM-DD.
 *
 * Sem isso, um registro às 22h de Cuiabá cairia no dia seguinte em UTC e a
 * obra teria dois diários para o mesmo dia de trabalho.
 */
export function diaDaObra(agora: Date, timeZone = 'America/Cuiaba'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

// ---------- Clima ----------

/** Tradução dos códigos WMO usados pelo Open-Meteo para rótulos do RDO. */
export function rotuloDoClima(codigoWmo: number): string {
  if (codigoWmo === 0) return 'Ensolarado';
  if (codigoWmo <= 2) return 'Parcialmente nublado';
  if (codigoWmo === 3) return 'Nublado';
  if (codigoWmo === 45 || codigoWmo === 48) return 'Neblina';
  if (codigoWmo <= 55) return 'Garoa';
  if (codigoWmo <= 65) return 'Chuva';
  if (codigoWmo <= 82) return 'Chuva forte';
  if (codigoWmo >= 95) return 'Tempestade';
  return 'Indefinido';
}

/**
 * Condição de trabalho sugerida pelo código WMO — a coluna Praticável /
 * Impraticável do RDO. Garoa e chuva fraca não param obra; chuva de verdade,
 * temporal e neve (por rigor) param. É sugestão automática: quem fecha o
 * diário pode marcar o dia como impraticável por cima.
 */
export function praticavelPeloCodigo(codigoWmo: number): boolean {
  if (codigoWmo >= 95) return false;              // tempestade
  if (codigoWmo >= 71 && codigoWmo <= 86) return false; // neve e aguaceiros
  if (codigoWmo >= 63 && codigoWmo <= 67) return false; // chuva moderada/forte
  return true;
}
