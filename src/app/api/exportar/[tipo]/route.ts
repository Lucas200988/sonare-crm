import { NextResponse } from 'next/server';
import { getSessionUser } from '@/server/auth/session';
import { prisma } from '@/server/db';
import { gerarCsv, numeroCsv, respostaCsv, type Coluna } from '@/lib/csv';
import { escopoDeProjetos } from '@/server/auth/project-scope';
import { formatDateBR } from '@/lib/dates';

/**
 * Exportação em CSV das listagens.
 *
 * Um único endereço atende todas as listas, com a permissão conferida por
 * tipo — o contador pede o financeiro, o comercial pede a carteira, e
 * ninguém precisa copiar da tela.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/exportar/[tipo]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { tipo } = await ctx.params;
  const empresa = { companyId: user.companyId, deletedAt: null };
  const pode = (p: string) => user.permissions.has(p);
  const negado = () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (tipo === 'clientes') {
    if (!pode('client:read')) return negado();
    const dados = await prisma.client.findMany({
      where: empresa, orderBy: { legalName: 'asc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Razão social', valor: (c) => c.legalName },
      { titulo: 'Nome fantasia', valor: (c) => c.tradeName },
      { titulo: 'CNPJ/CPF', valor: (c) => c.cnpj ?? c.cpf },
      { titulo: 'E-mail', valor: (c) => c.email },
      { titulo: 'Telefone', valor: (c) => c.phone },
      { titulo: 'Cidade', valor: (c) => c.city },
      { titulo: 'UF', valor: (c) => c.state },
      { titulo: 'Situação', valor: (c) => c.status },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'clientes');
  }

  if (tipo === 'receber') {
    if (!pode('finance:read')) return negado();
    const dados = await prisma.receivable.findMany({
      where: empresa,
      include: {
        client: { select: { legalName: true, tradeName: true } },
        contract: { select: { code: true } },
        project: { select: { code: true } },
        receipts: { where: { reversedAt: null }, select: { amount: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Código', valor: (r) => r.code },
      { titulo: 'Cliente', valor: (r) => r.client.tradeName ?? r.client.legalName },
      { titulo: 'Descrição', valor: (r) => r.description },
      { titulo: 'Contrato', valor: (r) => r.contract?.code },
      { titulo: 'Projeto', valor: (r) => r.project?.code },
      { titulo: 'Vencimento', valor: (r) => formatDateBR(r.dueDate) },
      { titulo: 'Valor', valor: (r) => numeroCsv(r.netValue.toString()) },
      {
        titulo: 'Recebido',
        valor: (r) => numeroCsv(
          r.receipts.reduce((acc, x) => acc + Number(x.amount), 0).toFixed(2),
        ),
      },
      { titulo: 'Situação', valor: (r) => r.status },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'contas-a-receber');
  }

  if (tipo === 'pagar') {
    if (!pode('finance:read')) return negado();
    const dados = await prisma.payable.findMany({
      where: empresa,
      include: { project: { select: { code: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Descrição', valor: (p) => p.description },
      { titulo: 'Fornecedor', valor: (p) => p.supplier },
      { titulo: 'Categoria', valor: (p) => p.category },
      { titulo: 'Projeto', valor: (p) => p.project?.code },
      { titulo: 'Vencimento', valor: (p) => formatDateBR(p.dueDate) },
      { titulo: 'Valor', valor: (p) => numeroCsv(p.amount.toString()) },
      { titulo: 'Pago em', valor: (p) => (p.paidAt ? formatDateBR(p.paidAt) : '') },
      { titulo: 'Valor pago', valor: (p) => numeroCsv(p.paidAmount?.toString()) },
      { titulo: 'Situação', valor: (p) => p.status },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'contas-a-pagar');
  }

  if (tipo === 'recebimentos') {
    if (!pode('finance:read')) return negado();
    const dados = await prisma.receipt.findMany({
      where: { companyId: user.companyId, reversedAt: null },
      include: {
        receivable: {
          select: {
            code: true, description: true,
            client: { select: { legalName: true, tradeName: true } },
          },
        },
      },
      orderBy: { receivedAt: 'desc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Data', valor: (r) => formatDateBR(r.receivedAt) },
      { titulo: 'Parcela', valor: (r) => r.receivable.code },
      {
        titulo: 'Cliente',
        valor: (r) => r.receivable.client.tradeName ?? r.receivable.client.legalName,
      },
      { titulo: 'Descrição', valor: (r) => r.receivable.description },
      { titulo: 'Valor', valor: (r) => numeroCsv(r.amount.toString()) },
      { titulo: 'Juros', valor: (r) => numeroCsv(r.interest.toString()) },
      { titulo: 'Multa', valor: (r) => numeroCsv(r.fine.toString()) },
      { titulo: 'Desconto', valor: (r) => numeroCsv(r.discount.toString()) },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'recebimentos');
  }

  if (tipo === 'notas') {
    if (!pode('invoice:read')) return negado();
    const dados = await prisma.invoice.findMany({
      where: empresa,
      include: { client: { select: { legalName: true, tradeName: true } } },
      orderBy: { issueDate: 'desc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Número', valor: (n) => n.number },
      { titulo: 'Série', valor: (n) => n.series },
      { titulo: 'Emissão', valor: (n) => formatDateBR(n.issueDate) },
      { titulo: 'Cliente', valor: (n) => n.client.tradeName ?? n.client.legalName },
      { titulo: 'Valor bruto', valor: (n) => numeroCsv(n.grossValue.toString()) },
      { titulo: 'Retenções', valor: (n) => numeroCsv(n.retentionsTotal.toString()) },
      { titulo: 'Valor líquido', valor: (n) => numeroCsv(n.netValue.toString()) },
      { titulo: 'Situação', valor: (n) => n.status },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'notas-fiscais');
  }

  if (tipo === 'projetos') {
    if (!pode('project:read')) return negado();
    const dados = await prisma.project.findMany({
      // a exportação não é porta dos fundos: mesmo recorte da tela
      where: { ...empresa, ...escopoDeProjetos(user) },
      include: {
        client: { select: { legalName: true, tradeName: true } },
        technicalLead: { select: { name: true } },
      },
      orderBy: { code: 'desc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Código', valor: (p) => p.code },
      { titulo: 'Projeto', valor: (p) => p.name },
      { titulo: 'Cliente', valor: (p) => p.client.tradeName ?? p.client.legalName },
      { titulo: 'Responsável técnico', valor: (p) => p.technicalLead?.name },
      { titulo: 'Situação', valor: (p) => p.status },
      { titulo: 'Início', valor: (p) => (p.startDate ? formatDateBR(p.startDate) : '') },
      {
        titulo: 'Prazo contratual',
        valor: (p) => (p.contractualDeadline ? formatDateBR(p.contractualDeadline) : ''),
      },
      { titulo: 'Valor', valor: (p) => numeroCsv(p.contractValue?.toString()) },
      { titulo: 'Arquivado', valor: (p) => (p.archivedAt ? 'sim' : 'não') },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'projetos');
  }

  if (tipo === 'art') {
    if (!pode('project:read')) return negado();
    const dados = await prisma.technicalResponsibility.findMany({
      where: { ...empresa, project: { ...empresa, ...escopoDeProjetos(user) } },
      include: {
        project: { select: { code: true } },
        professional: { select: { name: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
    const colunas: Coluna<(typeof dados)[number]>[] = [
      { titulo: 'Tipo', valor: (t) => t.docType },
      { titulo: 'Número', valor: (t) => t.number },
      { titulo: 'Conselho', valor: (t) => t.council },
      { titulo: 'Profissional', valor: (t) => t.professional?.name ?? t.professionalName },
      { titulo: 'Registro', valor: (t) => t.registration },
      { titulo: 'Projeto', valor: (t) => t.project?.code },
      { titulo: 'Emissão', valor: (t) => (t.issuedAt ? formatDateBR(t.issuedAt) : '') },
      { titulo: 'Taxa', valor: (t) => numeroCsv(t.value?.toString()) },
      { titulo: 'Situação', valor: (t) => t.status },
      { titulo: 'Baixa', valor: (t) => (t.dischargedAt ? formatDateBR(t.dischargedAt) : '') },
    ];
    return respostaCsv(gerarCsv(dados, colunas), 'art-rrt');
  }

  return NextResponse.json({ error: 'Tipo de exportação desconhecido' }, { status: 404 });
}
