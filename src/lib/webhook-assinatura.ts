import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verificação da assinatura de webhook no padrão Svix, usado pelo Resend.
 *
 * Separado do serviço porque não toca banco nem rede: é a fronteira de
 * segurança do endpoint público e precisa ser conferida por teste.
 *
 * A assinatura cobre id, timestamp e corpo — nem o conteúdo pode ser
 * adulterado, nem uma requisição antiga reenviada. Sem segredo configurado a
 * verificação falha: melhor recusar tudo do que aceitar qualquer um.
 */
export function assinaturaValida(
  segredo: string | undefined,
  cabecalhos: { id: string | null; timestamp: string | null; signature: string | null },
  corpo: string,
  agoraMs: number = Date.now(),
): boolean {
  const { id, timestamp, signature } = cabecalhos;
  if (!segredo || !id || !timestamp || !signature) return false;

  // requisição com mais de 5 minutos é descartada (proteção contra reenvio)
  const idade = Math.abs(agoraMs / 1000 - Number(timestamp));
  if (!Number.isFinite(idade) || idade > 300) return false;

  const chave = Buffer.from(segredo.replace(/^whsec_/, ''), 'base64');
  const esperada = createHmac('sha256', chave)
    .update(`${id}.${timestamp}.${corpo}`)
    .digest('base64');

  // o cabeçalho traz uma ou mais assinaturas, no formato "v1,<base64>"
  return signature.split(' ').some((parte) => {
    const valor = parte.split(',')[1];
    if (!valor || valor.length !== esperada.length) return false;
    return timingSafeEqual(Buffer.from(valor), Buffer.from(esperada));
  });
}
