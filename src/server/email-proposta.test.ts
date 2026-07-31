import { describe, expect, it } from 'vitest';
import { linkWhatsApp, montarEmailProposta, type DadosEmailProposta } from './email-proposta';

const BASE: DadosEmailProposta = {
  codigo: 'PROP-2026-018',
  nomeContato: 'Ana Ribeiro',
  nomeCliente: 'Condomínio Spazio Goiabeiras',
  servico: 'Laudo técnico de SPDA',
  valorTotal: 'R$ 10.000,00',
  prazo: '30 dias corridos após a assinatura',
  validade: '26/09/2026',
  mensagem: null,
  urlVisualizar: 'https://crm.sonare.com.br/verificar/ABC123/pdf',
  urlBaixar: 'https://crm.sonare.com.br/verificar/ABC123/pdf?baixar=1',
  urlAutenticidade: 'https://crm.sonare.com.br/verificar/ABC123',
  assinante: {
    nome: 'Lucas Silva Costa',
    titulo: 'Engenheiro Civil e Eletricista',
    whatsapp: '(65) 98463-3872',
    email: 'lucas@sonareengenharia.com.br',
    site: 'www.sonareengenharia.com.br',
  },
};

describe('montarEmailProposta', () => {
  it('cumprimenta o solicitante pelo nome', () => {
    const { html, texto } = montarEmailProposta(BASE);
    expect(html).toContain('Olá, Ana Ribeiro.');
    expect(texto).toContain('Olá, Ana Ribeiro.');
  });

  it('cai para "Prezados" sem contato definido', () => {
    const { html } = montarEmailProposta({ ...BASE, nomeContato: null });
    expect(html).toContain('Prezados,');
  });

  it('traz o resumo completo da proposta', () => {
    const { html } = montarEmailProposta(BASE);
    for (const trecho of [
      'Resumo da proposta', 'Laudo técnico de SPDA', 'R$ 10.000,00',
      '30 dias corridos', '26/09/2026',
    ]) {
      expect(html).toContain(trecho);
    }
  });

  it('omite as linhas sem dado em vez de mostrar campo vazio', () => {
    const { html } = montarEmailProposta({ ...BASE, servico: null, prazo: null });
    expect(html).not.toContain('Serviço');
    expect(html).not.toContain('Prazo estimado');
    expect(html).toContain('Valor total'); // o valor sempre existe
  });

  it('tem o botão de visualizar e o link de baixar', () => {
    const { html } = montarEmailProposta(BASE);
    expect(html).toContain('VISUALIZAR PROPOSTA');
    expect(html).toContain(BASE.urlVisualizar);
    expect(html).toContain('Baixar proposta em PDF');
    expect(html).toContain(BASE.urlBaixar);
  });

  it('avisa que é automático mas pode ser respondido', () => {
    const { html, texto } = montarEmailProposta(BASE);
    expect(html).toContain('enviada automaticamente pelo sistema de gestão da SONARE Engenharia');
    expect(html).toContain('respondê-la normalmente');
    expect(texto).toContain('respondê-la normalmente');
  });

  it('assina com nome, título e contatos', () => {
    const { html } = montarEmailProposta(BASE);
    for (const trecho of [
      'Lucas Silva Costa', 'Engenheiro Civil e Eletricista',
      '(65) 98463-3872', 'lucas@sonareengenharia.com.br', 'www.sonareengenharia.com.br',
    ]) {
      expect(html).toContain(trecho);
    }
  });

  it('usa a mensagem pessoal no lugar da abertura padrão', () => {
    const { html } = montarEmailProposta({ ...BASE, mensagem: 'Conforme nossa conversa de ontem, segue a proposta revisada.' });
    expect(html).toContain('Conforme nossa conversa de ontem');
    expect(html).not.toContain('Conforme solicitado, elaboramos');
  });

  it('escapa HTML vindo dos dados', () => {
    const { html } = montarEmailProposta({ ...BASE, nomeCliente: 'Alfa <script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('o WhatsApp é clicável e já abre a conversa citando a proposta', () => {
    const { html } = montarEmailProposta(BASE);
    expect(html).toContain('https://wa.me/5565984633872?text=');
    expect(html).toContain(encodeURIComponent('proposta PROP-2026-018'));
    expect(html).toContain('iniciar conversa');
  });

  it('sem WhatsApp cadastrado, a linha simplesmente não aparece', () => {
    const { html } = montarEmailProposta({
      ...BASE,
      assinante: { ...BASE.assinante, whatsapp: null },
    });
    expect(html).not.toContain('WhatsApp');
    expect(html).not.toContain('wa.me');
  });

  it('a versão em texto puro carrega o essencial', () => {
    const { texto } = montarEmailProposta(BASE);
    for (const trecho of [
      'PROP-2026-018', 'R$ 10.000,00', BASE.urlVisualizar, 'Atenciosamente', 'Lucas Silva Costa',
    ]) {
      expect(texto).toContain(trecho);
    }
  });
});

describe('linkWhatsApp', () => {
  it('converte o número exibido em link com o país na frente', () => {
    expect(linkWhatsApp('(65) 98463-3872', 'Oi'))
      .toBe('https://wa.me/5565984633872?text=Oi');
  });

  it('não duplica o 55 quando o número já vem completo', () => {
    expect(linkWhatsApp('+55 65 98463-3872', 'Oi'))
      .toBe('https://wa.me/5565984633872?text=Oi');
  });

  it('codifica a mensagem com acentos e espaços', () => {
    const url = linkWhatsApp('(65) 98463-3872', 'Olá! Sobre a proposta.');
    expect(url).toContain('text=Ol%C3%A1!%20Sobre%20a%20proposta.');
  });

  it('recusa número curto demais em vez de gerar link quebrado', () => {
    expect(linkWhatsApp('4633-3872', 'Oi')).toBeNull();
  });
});
