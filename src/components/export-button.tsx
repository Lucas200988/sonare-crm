import { Download } from 'lucide-react';

/**
 * Baixa a listagem em CSV, pronto para abrir no Excel.
 *
 * Exporta a lista inteira, não só a página exibida — é o que se espera ao
 * mandar os dados para o contador.
 */
export function ExportButton({ tipo, rotulo = 'Exportar' }: {
  tipo: 'clientes' | 'receber' | 'pagar' | 'recebimentos' | 'notas' | 'projetos' | 'art';
  rotulo?: string;
}) {
  return (
    <a
      href={`/api/exportar/${tipo}`}
      download
      title="Baixar em CSV (abre no Excel)"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
    >
      <Download className="h-4 w-4" aria-hidden /> {rotulo}
    </a>
  );
}
