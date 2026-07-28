import type { Metadata } from 'next';
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

export const metadata: Metadata = { title: 'Configurações — SONARE CRM' };

export default async function SettingsPage() {
  const user = await requirePermissionPage('settings:manage');
  const [{ leadSources, lossReasons, stages, services, paymentMethods, retentions }, aiStatus, company, allSettings] =
    await Promise.all([
      listCatalogs(user),
      getAiStatusAction(),
      prisma.company.findUniqueOrThrow({ where: { id: user.companyId } }),
      prisma.systemSetting.findMany({ where: { companyId: user.companyId } }),
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
      </div>
    </div>
  );
}
