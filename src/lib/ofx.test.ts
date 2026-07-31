import { describe, expect, it } from 'vitest';
import { parseOfx } from './ofx';

/** Formato SGML sem tags de fechamento — como Sicoob e BB exportam. */
const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260728
<TRNAMT>5000.00
<FITID>2026072801
<MEMO>PIX RECEBIDO CONDOMINIO SPAZIO
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260729120000[-4:CUI]
<TRNAMT>-1500.50
<FITID>2026072902
<MEMO>PAGAMENTO FORNECEDOR
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

/** Variante XML com tags fechadas — como o Itaú exporta. */
const OFX_XML = `<?xml version="1.0"?>
<OFX><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260730</DTPOSTED><TRNAMT>250,75</TRNAMT><FITID>abc-1</FITID><NAME>TED RECEBIDA</NAME></STMTTRN>
</BANKTRANLIST></OFX>`;

describe('parseOfx', () => {
  it('lê o formato SGML dos bancos brasileiros', () => {
    const t = parseOfx(OFX_SGML);
    expect(t).toHaveLength(2);
    expect(t[0]).toMatchObject({ fitId: '2026072801', amount: 5000, memo: 'PIX RECEBIDO CONDOMINIO SPAZIO' });
    expect(t[0].postedAt.getDate()).toBe(28);
    expect(t[1].amount).toBe(-1500.5);
  });

  it('lê a variante XML e aceita vírgula decimal e NAME no lugar de MEMO', () => {
    const t = parseOfx(OFX_XML);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ fitId: 'abc-1', amount: 250.75, memo: 'TED RECEBIDA' });
  });

  it('ignora a hora e o fuso do DTPOSTED — só o dia importa', () => {
    const t = parseOfx(OFX_SGML);
    expect(t[1].postedAt.getDate()).toBe(29);
    expect(t[1].postedAt.getHours()).toBe(0);
  });

  it('pula transação sem os campos essenciais em vez de quebrar o arquivo todo', () => {
    const quebrado = OFX_SGML.replace('<FITID>2026072801', '');
    const t = parseOfx(quebrado);
    expect(t).toHaveLength(1);
    expect(t[0].fitId).toBe('2026072902');
  });

  it('devolve lista vazia para arquivo que não é OFX', () => {
    expect(parseOfx('isto é um PDF renomeado')).toEqual([]);
  });
});
