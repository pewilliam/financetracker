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
  producao.
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
- **Alembic**: gerencia as migracoes do banco de dados, mantendo o historico de
  evolucao do schema em `backend/alembic/versions`.
- **Pydantic/FastAPI Schemas**: define os contratos de entrada e saida da API,
  validando os dados recebidos e padronizando as respostas.
- **python-jose, passlib e bcrypt**: compoem a base de seguranca do sistema,
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

## Seed de dados

Depois do primeiro build, use o comando abaixo para popular o banco:

```
docker compose exec api python seed.py
```
