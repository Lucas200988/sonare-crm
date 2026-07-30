-- Permite personalizar (ou desligar) o texto padrao de "Informacoes gerais" e
-- "Diferenciais" por orcamento, para servicos aos quais o texto da empresa
-- nao se aplica (ex.: limpeza de modulos fotovoltaicos).
ALTER TABLE "BudgetVersion" ADD COLUMN "generalInfoOverride" TEXT;
ALTER TABLE "BudgetVersion" ADD COLUMN "differentialsOverride" TEXT;
