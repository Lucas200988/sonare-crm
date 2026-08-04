-- Acesso a projeto por cartão: 'project:read' passa a dar acesso ao módulo, e
-- 'project:read_all' a todos os cartões. Sem a segunda, a pessoa vê só os
-- projetos em que está (equipe, responsável técnico, coordenação ou criação).
INSERT INTO "Permission" ("id", "code", "description")
VALUES (
  gen_random_uuid()::text,
  'project:read_all',
  'Ver todos os projetos (sem esta, só os da própria equipe)'
)
ON CONFLICT ("code") DO NOTHING;

-- Ninguém perde acesso na virada: quem enxergava tudo continua enxergando.
-- O administrador retira a permissão de quem deve ficar restrito, em Usuários.
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT rp."roleId", nova."id"
FROM "RolePermission" rp
JOIN "Permission" leitura ON leitura."id" = rp."permissionId" AND leitura."code" = 'project:read'
CROSS JOIN "Permission" nova
WHERE nova."code" = 'project:read_all'
ON CONFLICT DO NOTHING;

-- O mesmo para quem recebeu a leitura de projetos como permissão avulsa.
INSERT INTO "UserPermission" ("userId", "permissionId")
SELECT up."userId", nova."id"
FROM "UserPermission" up
JOIN "Permission" leitura ON leitura."id" = up."permissionId" AND leitura."code" = 'project:read'
CROSS JOIN "Permission" nova
WHERE nova."code" = 'project:read_all'
ON CONFLICT DO NOTHING;
