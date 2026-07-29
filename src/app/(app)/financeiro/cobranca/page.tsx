import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { getCollectionQueue, refreshOverdue } from '@/server/services/finance';
import { PageHeader, Card, EmptyState, Badge } from '@/components/ui';
import { formatBRL } from '@/lib/money';
import { formatDateBR, formatDateTimeBR } from '@/lib/dates';
import {
  RegisterContactButton, SendCollectionEmailButton, WhatsAppButton, TIPOS_COBRANCA,
} from './collection-actions';

export const metadata: Metadata = { title: 'Cobrança — SONARE CRM' };

/** Faixas de atraso: quem cobrar primeiro e com que tom. */
const FAIXAS = [
  { ate: 7, titulo: 'Até 7 dias', descricao: 'Lembrete cordial — costuma ser esquecimento', cor: 'amber' },
  { ate: 20, titulo: '8 a 20 dias', descricao: 'Segundo aviso, com o boleto reenviado', cor: 'amber' },
  { ate: 45, titulo: '21 a 45 dias', descricao: 'Cobrança formal por escrito', cor: 'red' },
  { ate: Infinity, titulo: 'Mais de 45 dias', descricao: 'Avaliar negativação ou jurídico', cor: 'red' },
];

export default async function CollectionPage() {
  const user = await requirePermissionPage('finance:read');
  // mantém a situação coerente com a data de hoje ao abrir a tela
  await refreshOverdue(user);

  const fila = await getCollectionQueue(user);
  const canWrite = user.permissions.has('finance:write');
  const total = fila.reduce((acc, r) => acc + Number(r.saldo), 0);

  const grupos = FAIXAS.map((faixa, i) => {
    const min = i === 0 ? 0 : FAIXAS[i - 1].ate + 1;
    return { ...faixa, itens: fila.filter((r) => r.diasAtraso >= min && r.diasAtraso <= faixa.ate) };
  }).filter((g) => g.itens.length > 0);

  return (
    <div>
      <PageHeader
        title="Cobrança"
        subtitle={`${fila.length} parcela(s) em atraso · ${formatBRL(total.toFixed(2))} a recuperar`}
      />

      {fila.length === 0 ? (
        <EmptyState
          title="Nada em atraso"
          description="Todas as parcelas estão em dia. A régua aparece aqui assim que algo vencer."
        />
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.titulo}>
              <div className="mb-2 flex items-center gap-2">
                <AlertTriangle className={`h-4 w-4 ${grupo.cor === 'red' ? 'text-red-500' : 'text-amber-500'}`} aria-hidden />
                <h2 className="text-sm font-semibold text-slate-900">{grupo.titulo}</h2>
                <span className="text-xs text-slate-500">— {grupo.descricao}</span>
              </div>

              <Card className="divide-y divide-slate-100">
                {grupo.itens.map((r) => {
                  const nomeCliente = r.client.tradeName ?? r.client.legalName;
                  const rotuloSugestao =
                    TIPOS_COBRANCA.find(([v]) => v === r.sugestao)?.[1] ?? 'Registrar contato';
                  const mensagem =
                    `Olá! Aqui é da SONARE Engenharia. Identificamos em aberto a cobrança `
                    + `${r.description} (${r.code}), no valor de ${formatBRL(r.saldo)}, `
                    + `com vencimento em ${formatDateBR(r.dueDate)}. `
                    + `Poderia verificar, por favor? Se já tiver sido paga, é só nos enviar o comprovante.`;

                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900">{nomeCliente}</p>
                        <p className="truncate text-xs text-slate-600">{r.description}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {r.code} · venceu em {formatDateBR(r.dueDate)} · {r.diasAtraso} dia(s) de atraso
                        </p>
                        {r.ultimoContato ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            Último contato: {formatDateTimeBR(r.ultimoContato.eventDate)}
                            {r.ultimoContato.channel ? ` por ${r.ultimoContato.channel}` : ''}
                          </p>
                        ) : (
                          <p className="mt-1 text-[11px] text-amber-700">Nenhum contato registrado ainda</p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-base font-bold text-slate-900">{formatBRL(r.saldo)}</p>
                        <Badge color={grupo.cor}>{rotuloSugestao}</Badge>
                      </div>

                      {canWrite ? (
                        <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
                          {r.client.phone ? (
                            <WhatsAppButton telefone={r.client.phone} mensagem={mensagem} />
                          ) : null}
                          <SendCollectionEmailButton
                            receivableId={r.id}
                            email={r.client.email}
                            sugestao={r.sugestao}
                            assunto={`Cobrança em aberto — ${r.code}`}
                            mensagem={mensagem}
                          />
                          <RegisterContactButton
                            receivableId={r.id}
                            sugestao={r.sugestao}
                            cliente={nomeCliente}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
