# Finance Tracker

Sistema de controle financeiro pessoal com React, FastAPI e MySQL.

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
