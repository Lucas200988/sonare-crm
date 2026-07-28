// Validações e formatações brasileiras (CPF, CNPJ, telefone, CEP).

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCPF(cpf: string): boolean {
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const pos of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < pos; i++) sum += Number(d[i]) * (pos + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== Number(d[pos])) return false;
  }
  return true;
}

export function isValidCNPJ(cnpj: string): boolean {
  const d = onlyDigits(cnpj);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatCPF(cpf: string): string {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatCNPJ(cnpj: string): string {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return cnpj;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatPhoneBR(phone: string | null | undefined): string {
  if (!phone) return '—';
  const d = onlyDigits(phone);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function formatCEP(cep: string | null | undefined): string {
  if (!cep) return '—';
  const d = onlyDigits(cep);
  if (d.length !== 8) return cep;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}
