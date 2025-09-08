INTRODUÇÃO PADRÃO (cole SEMPRE antes do seu comando)

Contexto do projeto (SmartCow v1)

Backend: Node 20, ESM (imports com .js), Express, Postgres via backend/dbx.js (mesmo pool do auth), validação com Zod, CRUD genérico (backend/resources/crudRouter.js).

Frontend: Vite/React, Axios com baseURL: '', todas as chamadas começam com /api/..., proxy do Vite envia /api → http://localhost:3001.

Escopo por usuário: todas as tabelas de recurso possuem owner_id; o CRUD injeta/filtra owner_id lendo o JWT (aceita id, userId ou sub).

Registro central: backend/resources/v1.register.js monta as rotas ativas e (no futuro) recursos extras por flags no .env.

Bootstrap: backend/bootstrapResources.js cria/ajusta tabelas/índices ao subir o servidor (inclusive colunas owner_id e created_at).

Rotas que já existem (e devem continuar as únicas ativas):

Auth: /api/auth/* (não alterar).

CRUD v1: /api/v1/animals e /api/v1/products.

Políticas obrigatórias (NÃO CRIAR COISAS À TOA):

Não criar novas pastas/rotas/arquivos. Somente editar o que já existe:

Backend: backend/resources/*.resource.js, backend/resources/crudRouter.js, backend/resources/v1.register.js, backend/bootstrapResources.js, backend/server.js.

Frontend: não mudar a estrutura. Ajustar apenas src/api.js, hooks e telas já existentes.

ESM 100% no backend: sem require/module.exports. Imports sempre com sufixo .js.

Sem /api/api: manter Axios baseURL: '' + caminhos /api/... no código.

Escopo por usuário é obrigatório em todo CRUD: usar scope: { column: 'owner_id', required: true }; ler o usuário do JWT (id | userId | sub).

Validação Zod em create/update; manter listFields, searchFields e sortable coerentes.

Contrato de resposta do LIST (não alterar):

{ "items": [...], "page": 1, "limit": 20, "total": 0, "pages": 1, "sort": "created_at", "order": "desc", "q": "" }


Banco: toda tabela de recurso contém id TEXT PRIMARY KEY, owner_id TEXT, created_at TIMESTAMPTZ DEFAULT now() e índices úteis (p. ex. owner_id, date, chaves estrangeiras).

Auth inalterado: não tocar nas rotas /api/auth/* nem no fluxo de login.

Registro central v1: novas entidades só entram via v1.register.js + DDL condicional no bootstrapResources.js, controladas por flags no .env, e desligadas por padrão.

Nada de dados no localStorage (exceto o token). Persistência é sempre no Postgres.

Recursos ativos e seus campos principais (referência):

animals (/api/v1/animals): id, owner_id, numero, brinco, nascimento, raca, estado (default 'vazia'), ultima_ia, parto, created_at.

products (/api/v1/products): id, owner_id, nome, categoria, unidade, preco_unit, quantidade, validade, created_at.

Recursos opcionais (ligar no futuro por flag, sem criar já):

Reprodução: repro-events (V1_ENABLE_REPRO_EVENTS=1)

Saúde: health-events (V1_ENABLE_HEALTH_EVENTS=1)

Mov. de estoque: stock-movements (V1_ENABLE_STOCK_MOVES=1)

Financeiro: finance-entries (V1_ENABLE_FINANCE=1)

Leite: milk-records (V1_ENABLE_MILK=1)

Ao ligar uma flag: v1.register.js monta a rota (/api/v1/<resource>) e bootstrapResources.js cria a tabela. Sem flag = não cria nada.

O que o Codex deve ENTREGAR quando eu pedir algo (sempre):

Diffs mínimos nos arquivos citados acima (nada de arquivo/pasta extra).

Backend e Frontend ajustados de forma coerente (ESM, rotas v1, escopo por usuário, Zod).

Sem quebrar /api/auth/*.

Testes rápidos no final da resposta:

POST /api/v1/animals → 201 com id e owner_id.

GET /api/v1/animals → 200 com o item criado.

(se aplicável) PUT/DELETE retornando 200/204.

No frontend, as chamadas aparecem como /api/v1/... (sem /api/api).

Quando for REALMENTE necessário um novo recurso (ex.: histórico/financeiro):

Não criar roteador/pasta novos “na mão”.

Somente: (a) adicionar bloco no v1.register.js (schema Zod, listFields, sortable, scope owner_id); (b) DDL condicional no bootstrapResources.js; (c) flag no .env desligada por padrão.

Nada mais além disso.
