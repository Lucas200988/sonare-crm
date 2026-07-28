-- Arquivar cartão: sai do quadro sem apagar o histórico
ALTER TABLE "Project" ADD COLUMN "archivedAt" TIMESTAMP(3);
