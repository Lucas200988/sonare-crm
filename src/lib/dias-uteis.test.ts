import { describe, expect, it } from 'vitest';
import {
  contextoDeCalendario, diaDaSemana, diaUtilAnterior, ehDiaUtil,
  hojeEmCuiaba, proximoDiaUtil,
} from './dias-uteis';

describe('calendário de trabalho (segunda a sexta)', () => {
  it('sexta → próximo dia útil é segunda, não sábado', () => {
    // 18/09/2026 é sexta — o caso em que o Jarvis chamou sábado de "amanhã"
    expect(diaDaSemana('2026-09-18')).toBe('sexta-feira');
    expect(proximoDiaUtil('2026-09-18')).toBe('2026-09-21');
    expect(proximoDiaUtil('2026-09-17')).toBe('2026-09-18');
  });

  it('segunda → dia útil anterior é sexta', () => {
    expect(diaUtilAnterior('2026-09-21')).toBe('2026-09-18');
    expect(diaUtilAnterior('2026-09-18')).toBe('2026-09-17');
  });

  it('fim de semana não é dia útil', () => {
    expect(ehDiaUtil('2026-09-19')).toBe(false);
    expect(ehDiaUtil('2026-09-20')).toBe(false);
    expect(ehDiaUtil('2026-09-21')).toBe(true);
  });

  it('o dia de Cuiabá vira à meia-noite local, não à UTC', () => {
    // 03:30 UTC do dia 19 ainda é 23:30 do dia 18 em Cuiabá (UTC-4)
    expect(hojeEmCuiaba(new Date('2026-09-19T03:30:00Z'))).toBe('2026-09-18');
  });

  it('o bloco do prompt entrega hoje e o próximo dia útil já resolvidos', () => {
    const bloco = contextoDeCalendario('2026-09-18');
    expect(bloco).toContain('sexta-feira, 18/09/2026');
    expect(bloco).toContain('segunda-feira, 21/09/2026');
  });
});
