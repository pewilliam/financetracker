# Finance Tracker

Sistema de controle financeiro pessoal com React, FastAPI e MySQL.

## Tecnologias utilizadas

O sistema é dividido em uma arquitetura full stack conteinerizada, com frontend,
backend e banco de dados rodando em servicos separados pelo Docker Compose.

### Frontend

- **React 18**: usado para construir a interface web do sistema, incluindo o
  dashboard, formularios, tabelas mensais, cartoes de faturas e fluxos de
  autenticacao.
- **Vite**: utilizado como ferramenta de desenvolvimento e build do frontend,
  oferecendo servidor local rapido e geracao dos arquivos estaticos de
  produção.
- **Tailwind CSS**: responsavel pela estilizacao da interface com classes
  utilitarias, mantendo os componentes visuais consistentes e responsivos.
- **React Router DOM**: controla a navegacao entre telas da aplicacao no lado
  do cliente.
- **Recharts**: empregado na visualizacao de dados financeiros em graficos do
  dashboard.
- **Lucide React**: fornece os icones usados nos componentes e acoes da
  interface.
- **React Hot Toast**: exibe notificacoes de feedback para o usuario, como
  mensagens de sucesso ou erro.
- **IMask**: auxilia na aplicacao de mascaras em campos de formulario, como
  valores monetarios e datas.

### Backend

- **FastAPI**: framework principal da API REST. Ele organiza os endpoints de
  autenticacao, transacoes, recorrencias, meses, faturas e compras parceladas,
  alem de gerar automaticamente a documentacao interativa em `/docs`.
- **Uvicorn**: servidor ASGI usado para executar a aplicacao FastAPI dentro do
  container da API.
- **SQLAlchemy**: camada de mapeamento objeto-relacional usada para modelar e
  consultar entidades como usuarios, transacoes, faturas, recorrencias, saldos
  mensais e parcelas.
- **Alembic**: gerencia as migrções do banco de dados, mantendo o historico de
  evolucao do schema em `backend/alembic/versions`.
- **Pydantic/FastAPI Schemas**: define os contratos de entrada e saida da API,
  validando os dados recebidos e padronizando as respostas.
- **PyJWT e bcrypt**: compoem a base de seguranca do sistema,
  com geracao/validacao de tokens JWT e hash de senhas.
- **python-dotenv**: carrega configuracoes de ambiente a partir do arquivo
  `.env`, como credenciais do banco e variaveis da aplicacao.

### Banco de dados e infraestrutura

- **MySQL 8**: banco relacional usado para persistir os dados financeiros,
  usuarios, faturas, recorrencias e historicos mensais.
- **PyMySQL**: driver usado pelo backend para se conectar ao MySQL via
  SQLAlchemy.
- **Docker**: empacota backend, frontend e banco de dados em containers,
  reduzindo diferencas entre ambientes.
- **Docker Compose**: orquestra os servicos `db`, `api` e `frontend`, define
  portas, variaveis de ambiente, volume persistente do MySQL e dependencias de
  inicializacao.

## Requisitos

- Docker
- Docker Compose

## Como rodar

1. Copie o arquivo de exemplo:

```
cp .env.example .env
```

No Windows (PowerShell):

```
Copy-Item .env.example .env
```

2. Suba os containers:

```
docker compose up --build
```

## URLs

- Frontend: http://localhost:5173
- API Docs: http://localhost:8010/docs

## Segurança da autenticação

Antes de publicar, defina `APP_ENV=production` e gere um `JWT_SECRET_KEY` aleatório
com pelo menos 32 caracteres. A API não inicia em produção sem esse segredo.

A API limita requisições por IP, com limites próprios mais restritos para login e
cadastro. Os valores podem ser ajustados pelas variáveis `RATE_LIMIT_*`,
`REGISTER_RATE_LIMIT_*` e `LOGIN_RATE_LIMIT_*` do `.env.example`. Se houver um
proxy reverso, adicione somente os IPs ou redes desse proxy a
`TRUSTED_PROXY_IPS`; cabeçalhos `X-Forwarded-For` vindos de outros endereços são
ignorados para impedir falsificação do IP de origem.

## Seed de dados

Depois do primeiro build, use o comando abaixo para popular o banco:

```
docker compose exec api python seed.py
```

## Deploy

O frontend é publicado automaticamente pelo Cloudflare a cada atualização da
branch `main`.

## Testes e verificação

Para rodar fora do Docker, use Node.js 24 e Python 3.12. Instale o frontend com
`npm ci` dentro de `frontend` e o backend com
`python -m pip install -r backend/requirements-dev.txt` em um ambiente virtual.

- Em `frontend`: `npm test`, `npm run build` e `npm audit`.
- Em `backend`, com `DATABASE_URL=sqlite://` e um `JWT_SECRET_KEY` de teste:
  `python -W error -m unittest discover -s tests`.
- Para testar no navegador, execute `npx playwright install --with-deps chromium`
  em `frontend` e depois `python scripts/test-e2e.py` na raiz, após o build.
  O comando inicia os servidores locais e cria um banco SQLite temporário.

O GitHub Actions executa esses checks em pushes e pull requests, incluindo
`pip-audit` das dependências do backend. Os testes de assinaturas fixam o relógio
de acordo com os dados de teste, sem alterar a data usada pelo sistema.
