// Renderização de minutas de contrato: substituição de variáveis e
// numeração automática de cláusulas no padrão dos modelos da SONARE.

export type RenderedClause = {
  /** "CLÁUSULA PRIMEIRA — DO OBJETO" */
  heading: string;
  /** Parágrafos já numerados: "1.1", "1.2"… */
  paragraphs: Array<{ number: string; text: string }>;
  /** Itens em algarismos romanos: "I", "II"… */
  items: Array<{ number: string; text: string }>;
};

const ORDINALS = [
  'PRIMEIRA', 'SEGUNDA', 'TERCEIRA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÉTIMA',
  'OITAVA', 'NONA', 'DÉCIMA', 'DÉCIMA PRIMEIRA', 'DÉCIMA SEGUNDA', 'DÉCIMA TERCEIRA',
  'DÉCIMA QUARTA', 'DÉCIMA QUINTA', 'DÉCIMA SEXTA', 'DÉCIMA SÉTIMA', 'DÉCIMA OITAVA',
  'DÉCIMA NONA', 'VIGÉSIMA', 'VIGÉSIMA PRIMEIRA', 'VIGÉSIMA SEGUNDA', 'VIGÉSIMA TERCEIRA',
  'VIGÉSIMA QUARTA', 'VIGÉSIMA QUINTA',
];

export function ordinalFeminino(n: number): string {
  return ORDINALS[n - 1] ?? `${n}ª`;
}

export function toRoman(n: number): string {
  const table: Array<[number, string]> = [
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let rest = n;
  let out = '';
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol;
      rest -= value;
    }
  }
  return out;
}

/**
 * Substitui {{caminho.aninhado}} pelos valores fornecidos.
 * Variável sem valor vira um marcador visível, para que a lacuna não
 * passe despercebida na revisão da minuta.
 */
export function applyVariables(text: string, values: Record<string, unknown>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split('.').reduce<unknown>(
      (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
      values,
    );
    if (value === undefined || value === null || value === '') return `[${path}]`;
    return String(value);
  });
}

/** Lista as variáveis que ficaram sem valor — usada para avisar antes de gerar o PDF. */
export function findMissingVariables(
  clauses: Array<{ title: string; paragraphs: string[]; items?: string[] }>,
  values: Record<string, unknown>,
): string[] {
  const missing = new Set<string>();
  const scan = (text: string) => {
    for (const match of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
      const path = match[1];
      const value = path.split('.').reduce<unknown>(
        (acc, key) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined),
        values,
      );
      if (value === undefined || value === null || value === '') missing.add(path);
    }
  };
  for (const clause of clauses) {
    scan(clause.title);
    clause.paragraphs.forEach(scan);
    clause.items?.forEach(scan);
  }
  return [...missing];
}

/**
 * Numera as cláusulas e resolve as variáveis.
 * Cláusula N vira "CLÁUSULA <ORDINAL> — <TÍTULO>" e seus parágrafos "N.1", "N.2"…
 */
export function renderClauses(
  clauses: Array<{ title: string; paragraphs: string[]; items?: string[] }>,
  values: Record<string, unknown>,
): RenderedClause[] {
  return clauses.map((clause, index) => {
    const n = index + 1;
    return {
      heading: `CLÁUSULA ${ordinalFeminino(n)} — ${applyVariables(clause.title, values).toUpperCase()}`,
      paragraphs: clause.paragraphs
        .map((p) => applyVariables(p, values).trim())
        .filter(Boolean)
        .map((text, i) => ({ number: `${n}.${i + 1}`, text })),
      items: (clause.items ?? [])
        .map((it) => applyVariables(it, values).trim())
        .filter(Boolean)
        .map((text, i) => ({ number: toRoman(i + 1), text })),
    };
  });
}

/** Qualificação da CONTRATANTE no preâmbulo do contrato. */
export function buildContractingPartyText(client: {
  legalName: string;
  personType: 'FISICA' | 'JURIDICA';
  document?: string | null;
  address?: string | null;
  representativeName?: string | null;
  representativeCpf?: string | null;
  representativeRole?: string | null;
}): string {
  const parts: string[] = [client.legalName.toUpperCase()];

  if (client.personType === 'JURIDICA') {
    parts.push('pessoa jurídica de direito privado');
    parts.push(client.document ? `inscrita no CNPJ sob o nº ${client.document}` : 'inscrita no CNPJ sob o nº [informar]');
    parts.push(client.address ? `sediada na ${client.address}` : 'sediada em [informar endereço]');
    if (client.representativeName) {
      const rep = [
        `neste ato representada por ${client.representativeName}`,
        client.representativeRole ? `, ${client.representativeRole}` : '',
        client.representativeCpf ? `, inscrito(a) no CPF nº ${client.representativeCpf}` : '',
      ].join('');
      parts.push(rep);
    } else {
      parts.push('neste ato representada por seu(sua) representante legal [informar]');
    }
  } else {
    parts.push('pessoa física');
    parts.push(client.document ? `inscrita no CPF sob o nº ${client.document}` : 'inscrita no CPF sob o nº [informar]');
    parts.push(client.address ? `residente e domiciliada na ${client.address}` : 'residente e domiciliada em [informar endereço]');
  }

  return `${parts.join(', ')}, doravante denominada simplesmente CONTRATANTE;`;
}

export type LegalRepresentative = {
  name: string;
  nationality?: string | null;
  maritalStatus?: string | null;
  profession?: string | null;
  rg?: string | null;
  cpf?: string | null;
};

/** Qualificação da CONTRATADA (SONARE) no preâmbulo. */
export function buildContractedPartyText(company: {
  legalName: string;
  cnpj?: string | null;
  address?: string | null;
  representatives?: LegalRepresentative[];
}): string {
  const parts: string[] = [company.legalName.toUpperCase()];
  parts.push('pessoa jurídica de direito privado');
  parts.push(company.cnpj ? `inscrita no CNPJ nº ${company.cnpj}` : 'inscrita no CNPJ nº [informar]');
  parts.push(company.address ? `situada na ${company.address}` : 'situada em [informar endereço]');

  const reps = company.representatives ?? [];
  if (reps.length > 0) {
    const qualified = reps.map((r) =>
      [
        r.name.toUpperCase(),
        r.nationality,
        r.maritalStatus,
        r.profession,
        r.rg ? `portador(a) do RG ${r.rg}` : null,
        r.cpf ? `inscrito(a) no CPF nº ${r.cpf}` : null,
      ].filter(Boolean).join(', '),
    );
    const conector = reps.length > 1 ? 'seus sócios-administradores' : 'seu sócio-administrador';
    parts.push(`neste ato representada por ${conector} ${qualified.join(' e ')}`);
  } else {
    parts.push('neste ato representada por seu(s) sócio(s)-administrador(es) [informar em Configurações]');
  }

  return `${parts.join(', ')}, doravante denominada apenas como CONTRATADA.`;
}
