'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { CalendarClock, User } from 'lucide-react';
import { moveStageAction } from '@/actions/opportunities';
import { formatBRL } from '@/lib/money';
import { formatDateBR } from '@/lib/dates';
import { EntregaChip, type EntregaChipDados } from '@/components/entrega-chip';

export type BoardStage = { id: string; name: string; kind: string; color: string | null };
export type BoardCard = {
  id: string;
  code: string;
  title: string;
  stageId: string;
  estimatedValue: string | null;
  priority: string;
  nextActionDate: string | null;
  client: { id: string; legalName: string; tradeName: string | null };
  commercialOwner: { id: string; name: string } | null;
  nextActivity: { title: string; dueAt: string | null } | null;
  entrega: EntregaChipDados | null;
};
export type LossReasonOption = { id: string; name: string };

const PRIORITY_DOT: Record<string, string> = {
  BAIXA: 'bg-slate-300',
  MEDIA: 'bg-sky-400',
  ALTA: 'bg-amber-400',
  URGENTE: 'bg-red-500',
};


function OpportunityCard({ card, overlay }: { card: BoardCard; overlay?: boolean }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${overlay ? 'rotate-2 shadow-lg' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-400">{card.code}</span>
        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[card.priority] ?? PRIORITY_DOT.MEDIA}`} title={`Prioridade ${card.priority.toLowerCase()}`} />
      </div>
      <Link href={`/crm/${card.id}`} className="mt-1 block text-sm font-medium leading-snug text-slate-900 hover:underline">
        {card.title}
      </Link>
      <p className="mt-1 truncate text-xs text-slate-500">{card.client.tradeName ?? card.client.legalName}</p>
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">
          {card.estimatedValue ? formatBRL(card.estimatedValue) : '—'}
        </span>
        {card.commercialOwner ? (
          <span className="flex items-center gap-1 text-slate-400" title={card.commercialOwner.name}>
            <User className="h-3 w-3" aria-hidden />
            {card.commercialOwner.name.split(' ')[0]}
          </span>
        ) : null}
      </div>
      {card.entrega ? (
        <p className="mt-2"><EntregaChip entrega={card.entrega} /></p>
      ) : null}
      {card.nextActivity ? (
        <p className="mt-2 flex items-center gap-1 rounded bg-amber-50 px-1.5 py-1 text-[11px] text-amber-800">
          <CalendarClock className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">
            {card.nextActivity.dueAt ? `${formatDateBR(card.nextActivity.dueAt)} · ` : ''}
            {card.nextActivity.title}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function DraggableCard({ card, disabled }: { card: BoardCard; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`${isDragging ? 'opacity-30' : ''} ${disabled ? '' : 'cursor-grab active:cursor-grabbing'}`}
    >
      <OpportunityCard card={card} />
    </div>
  );
}

function StageColumn({ stage, cards, children }: { stage: BoardStage; cards: BoardCard[]; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = cards.reduce((acc, c) => acc + (c.estimatedValue ? Number(c.estimatedValue) : 0), 0);

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-200/60">
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: stage.color ?? '#94a3b8' }} />
          <h3 className="text-sm font-semibold text-slate-800">{stage.name}</h3>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{cards.length}</span>
      </div>
      <p className="px-3 pb-2 text-[11px] text-slate-500">
        {total > 0 ? formatBRL(total) : ' '}
      </p>
      <div
        ref={setNodeRef}
        className={`flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto p-2 pt-0 transition ${isOver ? 'rounded-b-xl bg-amber-100/60' : ''}`}
      >
        {children}
      </div>
    </div>
  );
}

export function KanbanBoard({
  stages, cards, lossReasons, canWrite,
}: {
  stages: BoardStage[];
  cards: BoardCard[];
  lossReasons: LossReasonOption[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeCard, setActiveCard] = useState<BoardCard | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, string>>({});
  const [lossDialog, setLossDialog] = useState<{ opportunityId: string; targetStageId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const cardsByStage = useMemo(() => {
    const map = new Map<string, BoardCard[]>();
    for (const s of stages) map.set(s.id, []);
    for (const c of cards) {
      const stageId = optimistic[c.id] ?? c.stageId;
      if (!map.has(stageId)) continue; // etapa fechada fora do quadro
      map.get(stageId)!.push(c);
    }
    return map;
  }, [stages, cards, optimistic]);

  function onDragStart(event: DragStartEvent) {
    const card = cards.find((c) => c.id === event.active.id);
    setActiveCard(card ?? null);
  }

  function applyMove(opportunityId: string, targetStageId: string, lossReasonId?: string, lossNotes?: string) {
    setOptimistic((prev) => ({ ...prev, [opportunityId]: targetStageId }));
    startTransition(async () => {
      const result = await moveStageAction({ opportunityId, targetStageId, lossReasonId, lossNotes });
      if (result.needsLossReason) {
        setOptimistic((prev) => {
          const { [opportunityId]: _drop, ...rest } = prev;
          return rest;
        });
        setLossDialog({ opportunityId, targetStageId });
        return;
      }
      if (result.error) {
        setOptimistic((prev) => {
          const { [opportunityId]: _drop, ...rest } = prev;
          return rest;
        });
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;
    const card = cards.find((c) => c.id === active.id);
    if (!card) return;
    const currentStage = optimistic[card.id] ?? card.stageId;
    const targetStageId = String(over.id);
    if (targetStageId === currentStage) return;
    setError(null);
    applyMove(card.id, targetStageId);
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const stageCards = cardsByStage.get(stage.id) ?? [];
            return (
              <StageColumn key={stage.id} stage={stage} cards={stageCards}>
                {stageCards.map((card) => (
                  <DraggableCard key={card.id} card={card} disabled={!canWrite} />
                ))}
              </StageColumn>
            );
          })}
        </div>
        <DragOverlay>{activeCard ? <OpportunityCard card={activeCard} overlay /> : null}</DragOverlay>
      </DndContext>

      {lossDialog ? (
        <LossReasonDialog
          lossReasons={lossReasons}
          onCancel={() => setLossDialog(null)}
          onConfirm={(lossReasonId, lossNotes) => {
            const { opportunityId, targetStageId } = lossDialog;
            setLossDialog(null);
            applyMove(opportunityId, targetStageId, lossReasonId, lossNotes);
          }}
        />
      ) : null}
    </div>
  );
}

function LossReasonDialog({
  lossReasons, onCancel, onConfirm,
}: {
  lossReasons: LossReasonOption[];
  onCancel: () => void;
  onConfirm: (lossReasonId: string, lossNotes: string) => void;
}) {
  const [reasonId, setReasonId] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true" aria-label="Motivo da perda">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-slate-900">Registrar perda</h3>
        <p className="mt-1 text-sm text-slate-500">
          Para mover a oportunidade para uma etapa de perda, informe o motivo (obrigatório).
        </p>
        <div className="mt-4 space-y-3">
          <select
            value={reasonId}
            onChange={(e) => setReasonId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            aria-label="Motivo da perda"
          >
            <option value="">Selecione o motivo…</option>
            {lossReasons.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Observações (opcional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="button"
            disabled={!reasonId}
            onClick={() => onConfirm(reasonId, notes)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            Confirmar perda
          </button>
        </div>
      </div>
    </div>
  );
}
