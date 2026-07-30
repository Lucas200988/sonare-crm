import { describe, expect, it } from 'vitest';
import { badgeDoOrcamento } from './status-badge';

/**
 * "Aprovado" era só a aprovação interna, mas lia-se como negócio fechado.
 * O rótulo exibido passa a acompanhar a negociação com o cliente.
 */
describe('badgeDoOrcamento', () => {
  it('não chama mais de "Aprovado" o que o cliente nem viu', () => {
    const badge = badgeDoOrcamento('APROVADO');
    expect(badge.label).toBe('Liberado para envio');
    expect(badge.color).not.toBe('green');
  });

  it('acompanha a proposta depois de emitida', () => {
    expect(badgeDoOrcamento('APROVADO', [{ status: 'RASCUNHO' }]).label).toBe('Proposta gerada');
    expect(badgeDoOrcamento('APROVADO', [{ status: 'ENVIADA' }]).label).toBe('Proposta enviada');
    expect(badgeDoOrcamento('APROVADO', [{ status: 'VISUALIZADA' }]).label).toBe('Cliente visualizou');
  });

  it('só fica verde quando o cliente aceita', () => {
    const badge = badgeDoOrcamento('APROVADO', [{ status: 'ACEITA' }]);
    expect(badge.label).toBe('Aceito pelo cliente');
    expect(badge.color).toBe('green');
  });

  it('deixa claro que a recusa veio do cliente', () => {
    expect(badgeDoOrcamento('RECUSADO').label).toBe('Recusado pelo cliente');
  });

  it('não mexe nos status internos', () => {
    expect(badgeDoOrcamento('RASCUNHO').label).toBe('Rascunho');
    expect(badgeDoOrcamento('APROVACAO_INTERNA').label).toBe('Aprovação interna');
    expect(badgeDoOrcamento('CANCELADO').label).toBe('Cancelado');
  });

  it('a proposta só manda no rótulo quando o orçamento está liberado', () => {
    // recusado/cancelado com proposta antiga pendurada não pode virar "Proposta enviada"
    expect(badgeDoOrcamento('RECUSADO', [{ status: 'ENVIADA' }]).label).toBe('Recusado pelo cliente');
    expect(badgeDoOrcamento('CANCELADO', [{ status: 'ENVIADA' }]).label).toBe('Cancelado');
  });

  it('status desconhecido cai em rascunho em vez de quebrar', () => {
    expect(badgeDoOrcamento('QUALQUER_COISA').label).toBe('Rascunho');
  });
});
