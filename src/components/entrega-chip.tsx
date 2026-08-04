import { AlertTriangle, Check, CheckCheck, Clock, Eye, MousePointerClick } from 'lucide-react';
import { formatDateBR } from '@/lib/dates';
import { ROTULO_ENTREGA, diasDesde, type StatusEntrega } from '@/lib/entrega-status';

const ESTILO: Record<StatusEntrega, { classe: string; Icone: typeof Check }> = {
  ENVIADO: { classe: 'bg-slate-100 text-slate-600', Icone: Check },
  ATRASADO: { classe: 'bg-amber-50 text-amber-700', Icone: Clock },
  ENTREGUE: { classe: 'bg-green-50 text-green-700', Icone: CheckCheck },
  ABERTO: { classe: 'bg-sky-50 text-sky-700', Icone: Eye },
  CLIQUE: { classe: 'bg-sky-100 text-sky-800', Icone: MousePointerClick },
  REJEITADO: { classe: 'bg-red-50 text-red-700', Icone: AlertTriangle },
  SPAM: { classe: 'bg-red-50 text-red-700', Icone: AlertTriangle },
};

export type EntregaChipDados = {
  status: StatusEntrega;
  para: string;
  sentAt: string;
  propostaCode: string;
};

/**
 * Situação do último envio da proposta, do tamanho de uma célula de tabela
 * ou de um cartão de pipeline.
 *
 * Os dias desde o envio são metade da informação: "entregue" é bom no dia
 * seguinte e é cobrança atrasada duas semanas depois.
 */
export function EntregaChip({ entrega }: { entrega: EntregaChipDados }) {
  const estilo = ESTILO[entrega.status] ?? ESTILO.ENVIADO;
  const dias = diasDesde(entrega.sentAt, new Date());
  const quando = dias === 0 ? 'hoje' : dias === 1 ? 'ontem' : `há ${dias} dias`;

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded px-1.5 py-1 text-[11px] ${estilo.classe}`}
      title={`${entrega.propostaCode} · ${entrega.para} · enviada em ${formatDateBR(entrega.sentAt)}`}
    >
      <estilo.Icone className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">{ROTULO_ENTREGA[entrega.status]} · {quando}</span>
    </span>
  );
}
