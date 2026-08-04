import { describe, expect, it } from 'vitest';
import { avancaEntrega, diasDesde, resumoEntrega, type Entrega } from './entrega-status';

const em = (dia: number) => new Date(`2026-08-${String(dia).padStart(2, '0')}T12:00:00Z`);

describe('avancaEntrega', () => {
  it('avança na ordem natural da mensagem', () => {
    expect(avancaEntrega('ENVIADO', 'ENTREGUE')).toBe(true);
    expect(avancaEntrega('ENTREGUE', 'ABERTO')).toBe(true);
  });

  it('não anda para trás quando o evento chega fora de ordem', () => {
    // o provedor não garante ordem; "entregue" não pode virar "enviado"
    expect(avancaEntrega('ENTREGUE', 'ENVIADO')).toBe(false);
    expect(avancaEntrega('CLIQUE', 'ABERTO')).toBe(false);
  });

  it('falha sobrepõe qualquer avanço, e nada sobrepõe a falha', () => {
    expect(avancaEntrega('CLIQUE', 'REJEITADO')).toBe(true);
    expect(avancaEntrega('REJEITADO', 'ENTREGUE')).toBe(false);
    expect(avancaEntrega('SPAM', 'CLIQUE')).toBe(false);
  });
});

describe('resumoEntrega', () => {
  it('sem entregas não resume nada', () => {
    expect(resumoEntrega([])).toBeNull();
  });

  it('mostra o estágio mais avançado entre os destinatários', () => {
    // um abriu, o outro só recebeu: a proposta chegou, é isso que interessa
    const lista: Entrega[] = [
      { status: 'ENTREGUE', sentAt: em(4) },
      { status: 'ABERTO', sentAt: em(4) },
    ];
    expect(resumoEntrega(lista)?.status).toBe('ABERTO');
  });

  it('falha vence mesmo quando outro destinatário abriu', () => {
    // alguém não recebeu — é o que precisa de ação, mesmo com boa notícia junto
    const lista: Entrega[] = [
      { status: 'CLIQUE', sentAt: em(4) },
      { status: 'REJEITADO', sentAt: em(3) },
    ];
    expect(resumoEntrega(lista)?.status).toBe('REJEITADO');
  });

  it('no mesmo estágio, fica com o envio mais recente', () => {
    const lista: Entrega[] = [
      { status: 'ENTREGUE', sentAt: em(1) },
      { status: 'ENTREGUE', sentAt: em(6) },
    ];
    expect(resumoEntrega(lista)?.sentAt).toEqual(em(6));
  });

  it('reenvio recente sem abertura não apaga a abertura anterior', () => {
    /*
     * A proposta foi aberta na primeira tentativa e reenviada depois. O sinal
     * que vale continua sendo que o cliente viu — o reenvio não zera isso.
     */
    const lista: Entrega[] = [
      { status: 'ABERTO', sentAt: em(1) },
      { status: 'ENVIADO', sentAt: em(6) },
    ];
    expect(resumoEntrega(lista)?.status).toBe('ABERTO');
  });
});

describe('diasDesde', () => {
  it('conta dias inteiros', () => {
    expect(diasDesde(em(1), em(4))).toBe(3);
    expect(diasDesde(em(4), em(4))).toBe(0);
  });

  it('data no futuro não vira número negativo', () => {
    expect(diasDesde(em(9), em(4))).toBe(0);
  });
});
