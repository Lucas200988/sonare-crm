-- Trabalho entregue, aguardando o cliente pagar: sai dos alertas de prazo
-- sem se confundir com "concluído" (que só vale depois de receber).
ALTER TYPE "ProjectStatus" ADD VALUE 'AGUARDANDO_RECEBIMENTO';
