import type { Metadata } from 'next';
import { Download, FolderOpen } from 'lucide-react';
import { requirePermissionPage } from '@/server/auth/guards';
import { listCatalogs } from '@/server/services/catalogs';
import { PageHeader, Card } from '@/components/ui';
import { prisma } from '@/server/db';
import { getAiStatusAction } from '@/actions/ai';
import { CompanySection } from './company-section';
import { CommercialSection } from './commercial-section';
import {
  SimpleCatalogSection, StagesSection, ServicesSection, RetentionsSection,
} from './sections';
import { AiSection } from './ai-section';
import { ContractTemplatesSection, type ClausulaEditavel } from './contract-templates-section';

export const metadata: Metadata = { title: 'Configurações — SONARE CRM' };

export default async function SettingsPage() {
  const user = await requirePermissionPage('settings:manage');
  const [{ leadSources, lossReasons, stages, services, paymentMethods, retentions }, aiStatus, company, allSettings, contractTemplates] =
    await Promise.all([
      listCatalogs(user),
      getAiStatusAction(),
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId } }),
      prisma.systemSetting.findMany({ where: { companyId: user.companyId } }),
      prisma.contractTemplate.findMany({
        where: { companyId: user.companyId, active: true },
        orderBy: { name: 'asc' },
      }),
    ]);

  const setting = (key: string) => allSettings.find((s) => s.key === key)?.value ?? null;
  const signer = (key: string) => {
    const v = setting(key);
    return typeof v === 'string' ? v : null;
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Configurações"
        subtitle="Cadastros configuráveis do sistema — alterações valem para toda a empresa"
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5 lg:col-span-2">
          <CompanySection
            company={{
              ...company,
              signerName: signer('proposal.signerName'),
              signerTitle: signer('proposal.signerTitle'),
              signerRegistration: signer('proposal.signerRegistration'),
              signerPhone: signer('proposal.signerPhone'),
              signerEmail: signer('proposal.signerEmail'),
            }}
          />
        </Card>
        <Card className="p-5 lg:col-span-2">
          <CommercialSection
            settings={{
              maxDiscountPercent: String(setting('approval.maxDiscountPercent') ?? 10),
              minMarginPercent: String(setting('approval.minMarginPercent') ?? 20),
              maxValueWithoutApproval: String(setting('approval.maxValueWithoutApproval') ?? 100000),
              defaultValidityDays: String(setting('proposal.defaultValidityDays') ?? 60),
              infoGerais: String(setting('proposal.infoGerais') ?? ''),
              diferenciais: String(setting('proposal.diferenciais') ?? ''),
            }}
          />
        </Card>
        <Card className="p-5 lg:col-span-2">
          <AiSection status={aiStatus} />
        </Card>
        <Card className="p-5">
          <StagesSection stages={stages.map((s) => ({ id: s.id, name: s.name, kind: s.kind, color: s.color, active: s.active }))} />
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <SimpleCatalogSection title="Origens de lead" catalog="leadSource" items={leadSources} />
          </Card>
          <Card className="p-5">
            <SimpleCatalogSection title="Motivos de perda" catalog="lossReason" items={lossReasons} />
          </Card>
        </div>
        <Card className="p-5 lg:col-span-2">
          <ServicesSection
            services={services.map((s) => ({
              id: s.id, code: s.code, name: s.name, category: s.category,
              unit: s.unit, defaultPrice: s.defaultPrice?.toString() ?? null, active: s.active,
            }))}
          />
        </Card>
        <Card className="p-5">
          <SimpleCatalogSection title="Formas de pagamento" catalog="paymentMethod" items={paymentMethods} />
        </Card>
        <Card className="p-5">
          <RetentionsSection
            retentions={retentions.map((r) => ({
              id: r.id, code: r.code, name: r.name, percent: r.percent.toString(), active: r.active,
            }))}
          />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <ContractTemplatesSection
            templates={contractTemplates.map((t) => ({
              id: t.id, name: t.name, kind: t.kind,
              preamble: t.preamble ?? '',
              clauses: (t.clauses as unknown as Array<{ title: string; paragraphs?: string[]; items?: string[] }>)
                .map((c): ClausulaEditavel => ({
                  title: c.title, paragraphs: c.paragraphs ?? [], items: c.items ?? [],
                })),
            }))}
          />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <FolderOpen className="h-4 w-4 text-brand" aria-hidden /> Abrir pastas com um clique
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Por segurança, nenhum navegador abre pastas da rede sozinho. Este atalho resolve isso —
            instale uma vez em cada computador que usa o sistema.
          </p>
          <ol className="mt-3 space-y-1 text-sm text-slate-700">
            <li>1. Baixe e descompacte o arquivo abaixo</li>
            <li>2. Dê duplo clique em <span className="font-mono text-xs">instalar.cmd</span> (não pede senha de administrador)</li>
            <li>3. No primeiro clique em “Abrir pasta”, marque <strong>Sempre permitir</strong> no aviso do navegador</li>
          </ol>
          <a
            href="/ferramentas/sonare-abrir-pasta-v2.zip"
            download
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Download className="h-4 w-4" aria-hidden /> Baixar o atalho de pastas
          </a>
          <p className="mt-2 text-[11px] text-slate-500">
            Funciona apenas dentro da rede da empresa, onde a unidade <span className="font-mono">Z:</span> está
            disponível. Sem o atalho, o botão copia o caminho para colar no Explorador.
          </p>
        </Card>
      </div>
    </div>
  );
}
