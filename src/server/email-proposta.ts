/**
 * E-mail comercial da proposta.
 *
 * O e-mail antigo era um aviso de anexo; este é a apresentação da proposta —
 * o cliente vê o resumo, o valor e os botões antes mesmo de abrir o PDF.
 *
 * HTML de e-mail é território hostil: Outlook e Gmail ignoram CSS moderno,
 * então tudo aqui é tabela com estilo embutido, largura fixa de 600px e
 * botão construído com padding — o arroz com feijão que renderiza em
 * qualquer lugar.
 */

const VERMELHO = '#e22020';
const TINTA = '#0f172a';
const CINZA = '#64748b';
const BORDA = '#e2e8f0';

export type DadosEmailProposta = {
  /** "PROP-2026-018" ou "PROP-2026-018 Rev. 01". */
  codigo: string;
  /** Nome de quem recebe — o solicitante quando escolhido, senão a empresa. */
  nomeContato: string | null;
  nomeCliente: string;
  servico: string | null;
  valorTotal: string; // já formatado em R$
  prazo: string | null;
  validade: string | null; // data formatada
  /** Mensagem escrita por quem envia; substitui o parágrafo de abertura. */
  mensagem: string | null;
  urlVisualizar: string;
  urlBaixar: string;
  urlAutenticidade: string;
  assinante: {
    nome: string;
    titulo: string | null;
    whatsapp: string | null;
    email: string | null;
    site: string | null;
  };
};

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Link do WhatsApp com a conversa já começada no assunto certo.
 *
 * O wa.me exige o número em dígitos com o país na frente; o cadastro guarda
 * "(65) 98463-3872". Sem os 55, o link abriria uma conversa com número
 * inexistente — por isso o prefixo entra quando falta.
 */
export function linkWhatsApp(numeroExibido: string, mensagem: string): string | null {
  const digitos = numeroExibido.replace(/\D/g, '');
  // 10–11 dígitos = número nacional sem o país (fixo ou celular com o 9)
  const completo = digitos.length >= 12 ? digitos : `55${digitos}`;
  if (completo.length < 12) return null; // curto demais para ser um número real
  return `https://wa.me/${completo}?text=${encodeURIComponent(mensagem)}`;
}

/** Linha do quadro de resumo; some quando o dado não existe. */
function linhaResumo(rotulo: string, valor: string | null, destaque = false): string {
  if (!valor) return '';
  const estiloValor = destaque
    ? `color:${VERMELHO};font-size:18px;font-weight:bold`
    : `color:${TINTA};font-size:14px;font-weight:bold`;
  return `
    <tr>
      <td style="padding:7px 0;font-size:13px;color:${CINZA};vertical-align:top;width:170px">${rotulo}</td>
      <td style="padding:7px 0;${estiloValor}" align="right">${escapar(valor)}</td>
    </tr>`;
}

export function montarEmailProposta(d: DadosEmailProposta): { html: string; texto: string } {
  const saudacao = d.nomeContato ? `Olá, ${escapar(d.nomeContato)}.` : 'Prezados,';
  // Quem clica é o cliente: a mensagem pronta já abre a conversa no assunto certo
  const urlWhats = d.assinante.whatsapp
    ? linkWhatsApp(
        d.assinante.whatsapp,
        `Olá! Recebi a proposta ${d.codigo} da SONARE Engenharia e gostaria de conversar sobre ela.`,
      )
    : null;
  const abertura = d.mensagem
    ? escapar(d.mensagem).replace(/\n/g, '<br>')
    : `Conforme solicitado, elaboramos nossa proposta comercial para <strong>${escapar(d.nomeCliente)}</strong>${
        d.servico ? `, referente a <strong>${escapar(d.servico)}</strong>` : ''
      }. O resumo está abaixo e o documento completo acompanha este e-mail.`;

  const html = `
<!-- resumo que aparece na lista de mensagens, antes de abrir -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
  Proposta ${escapar(d.codigo)} — ${escapar(d.valorTotal)}${d.validade ? ` · válida até ${escapar(d.validade)}` : ''}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid ${BORDA};font-family:Arial,Helvetica,sans-serif">

      <!-- cabeçalho -->
      <tr>
        <td style="background:${TINTA};padding:22px 32px;border-bottom:3px solid ${VERMELHO}">
          <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:2px">SONARE</span>
          <span style="color:#cbd5e1;font-size:20px;letter-spacing:2px"> ENGENHARIA</span>
        </td>
      </tr>

      <!-- título -->
      <tr>
        <td style="padding:28px 32px 0">
          <p style="margin:0;font-size:12px;color:${CINZA};text-transform:uppercase;letter-spacing:1px">Proposta comercial</p>
          <h1 style="margin:4px 0 0;font-size:22px;color:${TINTA}">${escapar(d.codigo)}</h1>
        </td>
      </tr>

      <!-- abertura -->
      <tr>
        <td style="padding:18px 32px 0;font-size:14px;line-height:1.6;color:${TINTA}">
          <p style="margin:0 0 10px">${saudacao}</p>
          <p style="margin:0">${abertura}</p>
        </td>
      </tr>

      <!-- resumo -->
      <tr>
        <td style="padding:22px 32px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
                 style="background:#f8fafc;border:1px solid ${BORDA};border-radius:8px">
            <tr><td style="padding:16px 20px">
              <p style="margin:0 0 6px;font-size:11px;font-weight:bold;color:${CINZA};text-transform:uppercase;letter-spacing:1px">Resumo da proposta</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${linhaResumo('Serviço', d.servico)}
                ${linhaResumo('Valor total', d.valorTotal, true)}
                ${linhaResumo('Prazo estimado', d.prazo)}
                ${linhaResumo('Validade da proposta', d.validade)}
              </table>
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- botões -->
      <tr>
        <td align="center" style="padding:26px 32px 6px">
          <a href="${d.urlVisualizar}"
             style="display:inline-block;background:${VERMELHO};color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;letter-spacing:1px;padding:14px 42px;border-radius:8px">
            VISUALIZAR PROPOSTA
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 32px 4px">
          <a href="${d.urlBaixar}" style="font-size:13px;color:${CINZA};text-decoration:underline">
            Baixar proposta em PDF
          </a>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:0 32px;font-size:11px;color:#94a3b8">
          A proposta completa também está anexada a este e-mail.
        </td>
      </tr>

      <!-- convite à resposta -->
      <tr>
        <td style="padding:22px 32px 0;font-size:14px;line-height:1.6;color:${TINTA}">
          <p style="margin:0">
            Em caso de dúvidas ou necessidade de ajustes no escopo, valores ou condições,
            basta <strong>responder a esta mensagem</strong> — nossa equipe está à disposição.
          </p>
        </td>
      </tr>

      <!-- assinatura -->
      <tr>
        <td style="padding:24px 32px 0">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
                 style="border-top:1px solid ${BORDA}">
            <tr><td style="padding-top:16px">
              <p style="margin:0;font-size:14px;font-weight:bold;color:${TINTA}">Atenciosamente,</p>
              <p style="margin:10px 0 0;font-size:15px;font-weight:bold;color:${TINTA}">${escapar(d.assinante.nome)}</p>
              ${d.assinante.titulo ? `<p style="margin:2px 0 0;font-size:13px;color:${CINZA}">${escapar(d.assinante.titulo)}</p>` : ''}
              <p style="margin:2px 0 0;font-size:13px;color:${CINZA}">SONARE Engenharia</p>
              ${d.assinante.whatsapp ? `<p style="margin:8px 0 0;font-size:12px;color:${CINZA}">WhatsApp: ${
                urlWhats
                  ? `<a href="${urlWhats}" style="color:#16a34a;font-weight:bold;text-decoration:none">${escapar(d.assinante.whatsapp)} — iniciar conversa</a>`
                  : escapar(d.assinante.whatsapp)
              }</p>` : ''}
              ${d.assinante.email ? `<p style="margin:2px 0 0;font-size:12px;color:${CINZA}">E-mail: <a href="mailto:${d.assinante.email}" style="color:${VERMELHO};text-decoration:none">${escapar(d.assinante.email)}</a></p>` : ''}
              ${d.assinante.site ? `<p style="margin:2px 0 0;font-size:12px;color:${CINZA}">Site: <a href="https://${escapar(d.assinante.site.replace(/^https?:\/\//, ''))}" style="color:${VERMELHO};text-decoration:none">${escapar(d.assinante.site.replace(/^https?:\/\//, ''))}</a></p>` : ''}
            </td></tr>
          </table>
        </td>
      </tr>

      <!-- rodapé -->
      <tr>
        <td style="padding:24px 32px 22px">
          <p style="margin:0;border-top:1px solid ${BORDA};padding-top:14px;font-size:11px;line-height:1.5;color:#94a3b8">
            Esta mensagem foi enviada automaticamente pelo sistema de gestão da SONARE Engenharia,
            mas você pode respondê-la normalmente.
            Autenticidade do documento: <a href="${d.urlAutenticidade}" style="color:#94a3b8">${d.urlAutenticidade}</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>`.trim();

  const texto = [
    'SONARE ENGENHARIA',
    `Proposta comercial ${d.codigo}`,
    '',
    d.nomeContato ? `Olá, ${d.nomeContato}.` : 'Prezados,',
    '',
    d.mensagem
      ?? `Conforme solicitado, elaboramos nossa proposta comercial para ${d.nomeCliente}${d.servico ? `, referente a ${d.servico}` : ''}.`,
    '',
    'Resumo da proposta',
    d.servico ? `Serviço: ${d.servico}` : null,
    `Valor total: ${d.valorTotal}`,
    d.prazo ? `Prazo estimado: ${d.prazo}` : null,
    d.validade ? `Validade da proposta: ${d.validade}` : null,
    '',
    `Visualizar proposta: ${d.urlVisualizar}`,
    `Baixar em PDF: ${d.urlBaixar}`,
    'A proposta completa também está anexada a este e-mail.',
    '',
    'Em caso de dúvidas ou ajustes no escopo, valores ou condições, basta responder a esta mensagem.',
    '',
    'Atenciosamente,',
    d.assinante.nome,
    d.assinante.titulo,
    'SONARE Engenharia',
    d.assinante.whatsapp
      ? `WhatsApp: ${d.assinante.whatsapp}${urlWhats ? ` (${urlWhats})` : ''}`
      : null,
    d.assinante.email ? `E-mail: ${d.assinante.email}` : null,
    d.assinante.site ? `Site: ${d.assinante.site}` : null,
    '',
    'Mensagem enviada automaticamente pelo sistema de gestão da SONARE Engenharia — você pode respondê-la normalmente.',
    `Autenticidade: ${d.urlAutenticidade}`,
  ].filter((l): l is string => l !== null && l !== undefined).join('\n');

  return { html, texto };
}
