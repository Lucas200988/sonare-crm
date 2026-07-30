-- Solicitante do orcamento: a mesma empresa costuma ter varios contatos
-- pedindo servicos diferentes, e a proposta precisa sair endereçada ao certo.
ALTER TABLE "Budget" ADD COLUMN "contactId" TEXT;
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "ClientContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
