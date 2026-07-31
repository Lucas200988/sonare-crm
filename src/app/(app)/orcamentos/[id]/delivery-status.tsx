import { AlertTriangle, Check, CheckCheck, Clock, Eye, MousePointerClick } from 'lucide-react';

/**
 * Situação de entrega de um e-mail enviado pelo sistema.
 *
 * "Entregue" é fato — o servidor do destinatário aceitou. "Aberto" vem de um
 * pixel de rastreio e o rótulo diz isso, porque o Gmail carrega a imagem
 * sozinho e o número mente para os dois lados. O sinal que vale continua
 * sendo o cliente clicar para abrir a proposta.
 */
const ESTILO: Record<string, { rotulo: string; classe: string; Icone: typeof Check }> = {
  ENVIADO: { rotulo: 'Enviado', classe: 'text-slate-500', Icone: Check },
  ATRASADO: { rotulo: 'Provedor tentando entregar', classe: 'text-amber-600', Icone: Clock },
  ENTREGUE: { rotulo: 'Entregue na caixa', classe: 'text-green-700', Icone: CheckCheck },
  ABERTO: { rotulo: 'Aberto (indicativo)', classe: 'text-sky-700', Icone: Eye },
  CLIQUE: { rotulo: 'Clicou em um link', classe: 'text-sky-800', Icone: MousePointerClick },
  REJEITADO: { rotulo: 'Não chegou', classe: 'text-red-700', Icone: AlertTriangle },
  SPAM: { rotulo: 'Marcado como spam', classe: 'text-red-700', Icone: AlertTriangle },
};

export type EntregaItem = {
  id: string;
  para: string;
  status: string;
  detalhe: string | null;
  sentAt: string;
};

export function DeliveryStatus({ entregas }: { entregas: EntregaItem[] }) {
  if (entregas.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1">
      {entregas.map((e) => {
        const s = ESTILO[e.status] ?? ESTILO.ENVIADO;
        const falhou = e.status === 'REJEITADO' || e.status === 'SPAM';
        return (
          <li key={e.id} className={`text-[11px] ${s.classe}`}>
            <span className="inline-flex items-center gap-1">
              <s.Icone className="h-3 w-3 shrink-0" aria-hidden />
              <span className="font-medium">{s.rotulo}</span>
              <span className="text-slate-400">· {e.para}</span>
            </span>
            {falhou ? (
              <span className="mt-0.5 block rounded bg-red-50 px-2 py-1 text-red-800">
                {e.detalhe ?? 'O servidor do destinatário recusou a mensagem.'}
                {' '}Confira o endereço no cadastro do cliente e envie de novo.
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
