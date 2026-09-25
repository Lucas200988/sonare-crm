/**
 * Dois briefings, duas conversas.
 *
 * Quem é dono/dirige (ADMIN, DIRETORIA) recebe a leitura de gestão: empresa
 * inteira, problemas grandes e a EQUIPE nominalmente — quem entregou, quem
 * precisa de cobrança, o que delegar. O resto da equipe recebe o briefing
 * pessoal: as tarefas, prazos, projetos e conquistas de quem lê, em segunda
 * pessoa. Ninguém da operação recebe a régua da empresa inteira, e nenhum
 * gestor recebe só a própria lista de tarefas.
 */
export type PerfilDoBriefing = 'gestao' | 'operacao';

const PAPEIS_DE_GESTAO = ['ADMIN', 'DIRETORIA'];

export function perfilDoBriefing(papeis: readonly string[]): PerfilDoBriefing {
  return papeis.some((p) => PAPEIS_DE_GESTAO.includes(p.toUpperCase())) ? 'gestao' : 'operacao';
}
