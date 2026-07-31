import { NextResponse } from 'next/server';
import { prisma } from '@/server/db';
import { readAttachment } from '@/server/storage';
import { nomeArquivoProposta } from '@/lib/proposta-codigo';

/**
 * PDF público da proposta, acessado pelo código de verificação.
 *
 * É o destino dos botões "Visualizar proposta" do e-mail: o cliente abre o
 * documento no navegador sem precisar de login. A segurança é a mesma do link
 * de autenticidade — o código é aleatório e não enumerável, e só dá acesso ao
 * documento que o próprio cliente recebeu por e-mail.
 *
 * `?baixar=1` troca a exibição pelo download.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<'/verificar/[codigo]/pdf'>,
) {
  const { codigo } = await ctx.params;
  const code = decodeURIComponent(codigo).toUpperCase().trim();

  const proposal = await prisma.proposal.findUnique({
    where: { verificationCode: code },
    select: {
      companyId: true,
      code: true,
      revision: true,
      pdfAttachmentId: true,
      deletedAt: true,
      budgetVersion: {
        select: { budget: { select: { client: { select: { legalName: true, tradeName: true } } } } },
      },
    },
  }).catch(() => null);

  if (!proposal || proposal.deletedAt || !proposal.pdfAttachmentId) {
    return NextResponse.json({ error: 'Documento não encontrado.' }, { status: 404 });
  }

  const arquivo = await readAttachment(proposal.companyId, proposal.pdfAttachmentId);
  if (!arquivo) return NextResponse.json({ error: 'Arquivo indisponível.' }, { status: 404 });

  const cliente = proposal.budgetVersion.budget.client;
  const nome = nomeArquivoProposta(
    proposal.code, proposal.revision, cliente.tradeName ?? cliente.legalName,
  );
  const baixar = new URL(request.url).searchParams.get('baixar') === '1';

  return new NextResponse(new Uint8Array(arquivo.content), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${baixar ? 'attachment' : 'inline'}; filename="${encodeURIComponent(nome)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
