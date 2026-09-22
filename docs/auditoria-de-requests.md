# Auditoria de requests — plano de otimização

Data da análise: 21 de setembro de 2026.

Este documento consolida a auditoria estática do frontend e do backend, as contagens do MySQL local e o que o log do Uvicorn mostrou. Serve para decidir a ordem de implementação. Nenhum código da aplicação foi alterado nesta etapa.

## Como ler este documento

As chamadas contadas aqui são só de API (`/api/...`). JS, CSS, fontes e imagens do Vite ficam de fora e não entram no total de 21 requests.

Classificação usada nas tabelas:

| Classe | Significado |
|---|---|
| A | Necessário para renderizar a experiência que está na tela |
| B | Necessário em algum momento, e pode esperar o primeiro paint |
| C | Só deveria acontecer depois de uma interação |
| D | Há evidência de chamada repetida sem necessidade |
| E | O endpoint devolve dados além do que a tela usa |
| F | O request revela um problema maior de organização |
| G | Adequado para o uso atual |

## O que foi medido e o que não foi

Medido neste ambiente:

- Código de `frontend/src/api/api.js`, `AppShell.jsx` e das páginas.
- Routers, schemas e queries em `backend/app`.
- Contagem de linhas no MySQL local (container `financetracker-db`).
- Um trecho do log do Uvicorn de uma abertura real em outubro/2026, com status HTTP 200.

Não medido:

- Duração, bytes transferidos e waterfall do Network. O navegador disponível estava em `/login`, sem sessão. Não há tempos inventados neste documento.
- General log do MySQL. A contagem de queries por request é deduzida do código, não de um trace do banco.

Volume deste banco, para calibrar o plano:

| Tabela | Linhas |
|---|---|
| Transações | 602 (569 no usuário principal, 33 no outro) |
| Faturas | 41 (40 no usuário principal) |
| Itens de fatura | 85 |
| Compras parceladas | 22 |
| Parcelas | 147 |
| Recebíveis | 7 |
| Categorias | 20 |
| Carteiras | 7 |
| Modelos de fatura | 3 |
| Simulações | 2 |
| Transações com vínculo de recebível | 1 |

Transações por mês no usuário com histórico: 16 em abr/2026, subindo até 73 em set/2026 e 54 em out/2026, com lançamentos futuros até nov/2027.

## 1. Resumo executivo

O cliente declara cerca de 70 funções em `frontend/src/api/api.js`, sobre 13 routers. Três funções não têm caller: `GET /installments`, `GET /recurrences` e `PUT /months/{ano}/{mês}/opening-balance`.

Não há Axios, React Query, SWR nem Zustand. Todo o tráfego passa por `fetch` em `frontend/src/api/api.js`. O estado fica no `AppShell`. `refresh()` roda no mount e sempre que ano, mês ou idioma mudam.

No F5 do Dashboard isso são 21 chamadas de API: `GET /auth/me` e mais 20 de dados. Dez seguram o skeleton. Dez seguem depois do primeiro paint e não alimentam a aba Visão geral.

A aba inicial do Dashboard precisa do resumo do mês, da série diária e dos cabeçalhos das faturas em aberto. O primeiro paint também espera o breakdown de categorias, as faturas com todos os itens e seis resumos mensais. O resumo do mês corrente é pedido duas vezes.

Nas rotas sem atalho (Faturas, Parcelamentos, Recebíveis, Simulador e Configurações) o skeleton espera as 20 chamadas de dados antes de montar a página.

Trocar de rota não repete o pacote. F5, troca de mês e troca de idioma repetem.

Maiores oportunidades, nesta ordem:

1. Parar de carregar todos os domínios em toda entrada.
2. Enxugar o primeiro paint do Dashboard.
3. Unir os summaries num intervalo e eliminar a duplicata do mês corrente.
4. Listar faturas sem itens.
5. Tirar `expense-options` do bootstrap.
6. Fazer o preview do simulador e o saldo inicial deixarem de reconstruir o mês inteiro várias vezes.

## 2. De onde vêm os requests

Arquivo central: `frontend/src/components/layout/AppShell.jsx`, função `refresh()`.

Trigger: `useEffect` em `[year, month, language]`, mais `refresh()` manual depois de excluir categoria, alternar ou excluir modelo de fatura, e inserir itens pelo simulador.

Há um atalho de prioridade que libera o skeleton antes do pacote completo:

| Rota | O que libera o skeleton | O resto |
|---|---|---|
| `/` Dashboard | Mês, summary, faturas, breakdown e 6 summaries | Continua em background |
| `/meses` | Mês, summary e `/months/summary` | Continua em background |
| `/categorias` | Categorias, breakdown atual, breakdown anterior e plano | Continua em background |
| `/carteiras` | `GET /wallets` | Continua em background |
| `/faturas`, `/parcelamentos`, `/recebiveis`, `/simulador`, `/configuracoes` | Nada: o skeleton espera as 20 chamadas | A página só monta depois |

Dentro do mesmo `refresh()`, o objeto `priorityPayloads` evita repetir o que o lote prioritário já resolveu. Esse dedup morre no fim da função. Não há cache entre ciclos, entre rotas ou entre meses.

O `loading` envolve as `<Routes>`. Enquanto é verdadeiro, a página filha desmonta. Parcelamentos e Simulador, ao montar de novo, disparam o request próprio.

## 3. Mapa geral de requests

| Página | Endpoint | Método | Trigger | Necessário na entrada dessa tela? | Classe |
|---|---|---|---|---|---|
| Sessão | `/auth/me` | GET | F5 com token | Sim | A |
| Login | `/auth/login` | POST | Submit | Sim, no submit | G |
| Cadastro | `/auth/register` | POST | Submit | Sim, no submit | G |
| Dashboard, Meses | `/months/{y}/{m}` | GET | `refresh()` | Sim no Dashboard e em Meses | A, E |
| Dashboard, Meses | `/months/{y}/{m}/summary` | GET | `refresh()` | Sim para os cards | A, D |
| Dashboard | `/months/{mês}/summary` × 5 anteriores | GET | Série de 6 meses | Não na aba Visão geral | B |
| Dashboard, Faturas | `/invoices` | GET | `refresh()` | Cabeçalho sim; itens não | B, E, F |
| Dashboard, Categorias | `/months/{y}/{m}/categories` | GET | `refresh()` | Não na Visão geral | B, E |
| Categorias | `/months/{anterior}/categories` | GET | `refresh()` | Não no Dashboard | B |
| Formulários | `/categories` | GET | `refresh()` | Não na Visão geral | B |
| Configurações, modal | `/invoice-templates` | GET | `refresh()` | Não | C |
| Carteiras, formulários | `/wallets?include_archived=true` | GET | `refresh()` | Não no Dashboard | C |
| Categorias | `/budget-plans/{y}/{m}` | GET | `refresh()` | Não no Dashboard | C |
| Recebíveis | `/receivables` | GET | `refresh()` | Não no Dashboard | C |
| Recebíveis | `/receivables/linked-transactions` | GET | `refresh()` | Não no Dashboard | C |
| Modal de recebível | `/receivables/people` | GET | `refresh()` | Não | C |
| Meses, Faturas, formulário | `/receivables/expense-options` | GET | `refresh()` | Não no Dashboard | C, E, F |
| Meses, Simulador | `/months/summary` | GET | `refresh()` | Não no Dashboard | C, F |
| Parcelamentos | `/installments/page` | GET | Mount, filtro, página | Sim nessa página | G |
| Detalhe de parcela | `/installments/{id}` | GET | Abrir detalhes | Não | C, G |
| Simulador | `/simulations` | GET | Mount da página | Sim nessa página | G |
| Simulador | `/simulations/preview` | POST | Mount e cada mudança | Sim para o gráfico | F |
| Simulador | `/simulations/{id}` | GET | Abrir simulação salva | Não | C, G |
| Carteiras | `/wallets/{id}` | GET | Clique na carteira | Não | C, G |
| Carteiras | `/wallets/{id}/movements` | GET | Clique e troca de mês | Não | C, G |
| Carteiras | `/wallets/consolidation/preview` | POST | Abrir consolidação | Não | C, G |
| Dashboard, Categorias | `/months/{y}/{m}/categories?include_details=true` | GET | Clique na categoria | Não | C, G |
| Configurações | `/auth/me` | PUT | Salvar perfil | Não | G |
| Configurações | `/auth/password` | PUT | Trocar senha | Não | G |

Funções declaradas e sem caller na interface: `listInstallments`, `listRecurrences`, `setOpeningBalance`.

## 4. Carregamento inicial

Pergunta usada em cada linha: o usuário precisa desses dados agora para a experiência que está vendo?

F5 do Dashboard, aba Visão geral (padrão):

| Request | Precisa agora? | Quando carregar |
|---|---|---|
| `GET /auth/me` | Sim | Na entrada |
| `GET /months/{y}/{m}` | Sim, para o gráfico e o ranking | Na entrada, com payload menor |
| `GET /months/{y}/{m}/summary` | Sim, para os cards | Junto da série, uma vez só |
| `GET /months/{mês anterior}/summary` | Sim, para o “vs mês anterior” dos cards | Na mesma série |
| `GET /months/{m-2…m-5}/summary` | Não | Ao abrir a aba Histórico |
| `GET /invoices` | Só nome, cor, vencimento e total de até 5 faturas abertas | Cabeçalhos na entrada; itens ao abrir Ver itens |
| `GET /months/{y}/{m}/categories` | Não | Ao abrir a aba Categorias |
| `GET /categories` | Não na Visão geral | Com a aba Categorias |
| `GET /months/{anterior}/categories` | Não | Ao abrir a página Categorias |
| `GET /invoice-templates` | Não | Ao abrir o modal de nova fatura ou a aba Modelos |
| `GET /wallets` | Não | Ao abrir Carteiras ou o primeiro formulário que escolhe carteira |
| `GET /budget-plans/{y}/{m}` | Não | Ao abrir Categorias |
| `GET /receivables` e vinculados | Não | Ao abrir Recebíveis |
| `GET /receivables/people` | Não | Ao abrir o modal |
| `GET /receivables/expense-options` | Não | Ao abrir o seletor de gasto |
| `GET /months/summary` | Não | Ao abrir Meses ou o Simulador |

Contagem que bloqueia o skeleton, incluindo `GET /auth/me`, quando a rota é aberta direto no F5:

| Rota | Chamadas antes do conteúdo |
|---|---|
| Carteiras | 2 |
| Meses | 4 |
| Categorias | 5 |
| Dashboard | 11 |
| Faturas, Recebíveis, Configurações | 21 |
| Parcelamentos | 22 (o `GET /installments/page` só começa depois do skeleton) |
| Simulador | 23 (lista e preview só começam depois do skeleton) |

O log do Uvicorn de uma abertura em outubro/2026 mostra a onda do Dashboard com HTTP 200, inclusive dois `GET /months/2026/10/summary`. `GET /months/2026/10/categories?include_details=true` aparece depois, separado, compatível com um clique na categoria. O log não traz duração nem tamanho.

## 5. Análise por página

### Login e sessão

`POST /auth/login` e `POST /auth/register` no submit, devolvendo token e usuário. Com token no F5, `GET /auth/me` uma vez no `AuthProvider`. Sem token, nenhum request financeiro até o submit.

### Dashboard

Arquivo: `frontend/src/components/Dashboard.jsx`. Aba inicial: `overview`. As outras abas só trocam estado local.

| Bloco | Request | Na tela agora? | Pode esperar? | Já vem em outro lugar? |
|---|---|---|---|---|
| Cards de saldo, ganhos, gastos e projeção | Summary do mês | Sim | Não | Os totais também estão em `GET /months/{y}/{m}` |
| “Vs mês anterior” nos cards | Summary do mês anterior, dentro dos 6 | Sim | Não, se o card ficar | É um dos seis pontos da série |
| Gráfico de evolução diária | `GET /months/{y}/{m}` | Sim | Não | Não |
| Maiores gastos | `transactions` dentro dos dias | Sim, top 5 | Não | O payload traz todos os dias e `linked_expense` |
| Próximos vencimentos | `GET /invoices` | Sim, top 5 em aberto | Não para o cabeçalho | Itens e parcelas não são lidos aqui |
| Aba Histórico | 6 summaries | Não, até o clique | Sim | O mês corrente já foi pedido |
| Aba Categorias | Breakdown + `GET /categories` | Não, até o clique | Sim | A tela usa `chart_items`; `items` é a outra árvore |
| Detalhe da categoria | `include_details=true` | Só no clique | Já é sob demanda | `detailsRequestRef` reusa enquanto a aba não muda |

O gráfico usa data, saldo e projeção. O ranking usa descrição, valor, data, categorias, carteira e `invoice_id`. `GET /months` também devolve `notes` (concatenação das descrições) e `linked_expense`. Com 1 vínculo em toda a base, essa cadeia quase sempre volta vazia.

Primeiro paint mínimo desejado: um resumo do mês, a série diária enxuta (data, saldo, projeção) e até cinco faturas em aberto com nome, cor, vencimento e total.

### Meses

O skeleton cai depois de `GET /months`, summary e `/months/summary`. A tabela usa `days`, `invoices` e `expense-options`. As opções de gasto chegam no segundo lote, então o insight de recebível pode aparecer um instante depois. Abrir um dia não busca nada.

### Categorias e orçamento

Quatro chamadas prioritárias são usadas na página: categorias, breakdown do mês, breakdown do mês anterior e plano. O plano inclui `income_candidates`, usados no painel de planejamento, que começa fechado. O detalhe de categoria é o único GET extra, no clique.

### Carteiras

O skeleton espera só `GET /wallets`. Detalhe e movimentos são sob demanda: `GET /wallets/{id}` e `GET /wallets/{id}/movements` com ano, mês e página de 10. Troca de mês do histórico refaz a página. Preview de consolidação é POST ao abrir o modal. Depois de salvar, a página chama `listWallets` de novo e ainda `syncMonthCollections`.

Este é o melhor padrão do app: lista leve na entrada, detalhe no clique, paginação no histórico.

### Faturas

A arquitetura desejada (período visível na entrada, outro período ao expandir, itens só em Ver itens) não existe.

| Comportamento desejado | Estado atual |
|---|---|
| Só o período visível no início | Todas as faturas de todos os meses, abertas e pagas |
| Outro período ao expandir o accordion | Os grupos Mês atual, Próximo, Demais e Pagas já estão na memória |
| Itens só em Ver itens | `items` e `installment_items` vêm em toda fatura da lista |
| Reusar sem novo request | Sim, enquanto o shell não entra em `refresh` ou troca de mês/idioma |
| Paginação | Não existe em `/invoices` |

`expandedGroups` e `itemsInvoiceId` são estado local. Fechar e reabrir não chama a API. Criar, editar item, pagar ou excluir devolve `InvoiceOut` completo e faz upsert. Em seguida `syncMonthCollections` refaz mês, summaries, categorias, orçamento, carteiras e opções de gasto.

A página ainda recebe `expense-options` para o insight de recebível no modal de item. Esse insight só é necessário quando o usuário abre um item. O filtro de busca é 100% cliente.

### Parcelamentos

Depois do shell, `GET /installments/page` com aba, busca, categorias, modelo, situação, ordenação, página e `page_size` 12. Há paginação de verdade. Troca de filtro ou de página refaz a chamada. Voltar à rota monta o componente de novo e busca outra vez. O filtro de cartão usa a lista completa de invoices só para nome e `template_id`. Abrir detalhes: `GET /installments/{id}`.

### Recebíveis

A página não busca nada sozinha. Lista, pessoas, vínculos e `expense-options` já vieram no shell, mesmo que o usuário nunca abra o modal. Não há paginação. Pagamento e exclusão refazem os quatro GETs de recebíveis e, no pagamento, também `syncMonthCollections`.

### Simulador

`GET /simulations` no mount. `POST /simulations/preview` a cada mudança do rascunho, com debounce de 500 ms em `items`. `include_real` começa verdadeiro. O backend reconstrói o mês completo, com transações e eager load, para cada mês do intervalo, até 120, e só então resume três totais. `monthCards` só serve para achar o último mês com movimento. Inserir itens chama `refresh()` inteiro.

### Configurações

A aba Conta não precisa de dado financeiro e mesmo assim espera o pacote. `PUT /auth/me` ao salvar perfil e `PUT /auth/password` ao trocar senha. Modelos usam a lista já carregada; salvar um modelo refaz `GET /invoice-templates`. Excluir ou alternar modelo chama `refresh()` completo. A aba Financeiro lê `summary` e `monthData` que já vieram no pacote.

## 6. O que cada ação do usuário dispara

| Ação | Requests | Necessário | Dá para ficar no estado local? |
|---|---|---|---|
| Abrir o app / F5 | `GET /auth/me` + pacote do `refresh()` | Só o recorte da rota | Não |
| Login / cadastro | POST de auth | Sim | O token e o user já voltam na resposta |
| Trocar de rota | Nenhum no shell. Parcelamentos e Simulador buscam de novo se montarem | A busca da página, se o dado não estiver fresco | O shell já segura o resto |
| Mudar mês ou ano | `refresh()` inteiro, cerca de 20 GETs. A rota desmonta por causa de `loading` | Mês, summary e o que a página aberta mostra | Os cinco summaries vizinhos já podem estar em memória |
| Mudar idioma | O mesmo `refresh()` inteiro | Nenhum dado de API | Sim. Os rótulos saem de `formatMonthLabel` no cliente |
| Filtro, busca, página em Parcelamentos | `GET /installments/page` com os novos parâmetros | Sim | Não |
| Filtro de Faturas, accordion, Ver itens, abas do Dashboard | Nenhum | — | Já é local |
| Clique numa categoria | `GET .../categories?include_details=true` uma vez por breakdown | Sim | Reuso em `detailsRequestRef` até o breakdown mudar |
| Abrir detalhes de parcelamento | `GET /installments/{id}` | Sim | Não |
| Abrir carteira | `GET /wallets/{id}` e movimentos paginados | Sim | Não |
| Abrir modal de fatura, recebível ou lançamento | Nenhum, se o shell já carregou templates, pessoas e opções | Os dados do modal | Sim, se tiverem sido buscados na abertura do modal |
| Criar, editar ou excluir lançamento, lote ou recorrência | A escrita + `syncMonthCollections` | O mês afetado | A resposta da escrita não atualiza o mês |
| Criar fatura, item, pagar, excluir, mudar vencimento | A escrita (devolve a fatura) + upsert + `syncMonthCollections` | A fatura e o mês | A fatura já faz upsert; o mês é rebuscado por inteiro |
| Parcelamento criado, editado ou excluído | A escrita + `GET /invoices` + `syncMonthCollections` | A página de parcelas (via `revision`) e a fatura | A lista de faturas inteira volta |
| Recebível salvo ou excluído | 4 GETs de recebíveis | Sim, a lista mudou | Dá para aplicar a resposta |
| Pagamento de recebível | 4 GETs + `syncMonthCollections` | A lista e o mês, se o pagamento gerou lançamento | Dá para restringir ao mês |
| Excluir categoria ou modelo | `refresh()` completo | A lista afetada e os totais que dependem dela | O fan-out inteiro é largo demais |
| Inserir itens do simulador | `refresh()` completo | Os meses em que os itens caíram | Idem |

`syncMonthCollections` pede, em paralelo: mês, summary, dois breakdowns, orçamento, vínculos, `expense-options`, `/months/summary`, seis summaries e carteiras.

## 7. Duplicações

### Literal

`GET /months/{y}/{m}/summary` do mês selecionado. Mesmo método, mesmos parâmetros, mesmo `refresh()`. Uma chamada monta o card; a outra é o offset 0 da série `[-5, -4, -3, -2, -1, 0]`. Acontece em produção e em desenvolvimento. O log de outubro/2026 mostra as duas com 200.

Os outros cinco summaries têm meses diferentes e alimentam o gráfico de histórico. Não são duplicata.

### Funcional

`GET /months/{y}/{m}` e `GET /months/{y}/{m}/summary` recalculam saldo inicial, receitas, despesas e fechamento. O backend já tem `_summarize_month_data`, que deriva o summary a partir do mês. Os payloads são diferentes; o trabalho no banco é o mesmo.

Os seis `GET /summary` e o `GET /months/summary` repetem receita, despesa e saldo dos mesmos meses, em formatos diferentes.

`items` e `chart_items` no breakdown são dois agrupamentos das mesmas linhas. O Dashboard usa `chart_items`. A página Categorias usa os dois: `items` para o limite por categoria e `chart_items` para o gráfico.

`GET /invoices` e as transações do mês descrevem a mesma fatura por lados diferentes. O card de vencimento só precisa do cabeçalho.

### React

`refresh()` depende de `year`, `month` e `language`, valores estáveis. Não há objeto recriado na lista de dependências. O efeito não aborta a request anterior.

O app usa React 18.3 com `StrictMode` em `frontend/src/main.jsx`. Em desenvolvimento o React executa o efeito, desmonta e executa de novo. As duas ondas saem para a rede. `monthLoadSequence` descarta o estado da primeira. Em produção o StrictMode não repete o efeito.

O log está truncado no início e tem um `GET /receivables/expense-options` antes da onda completa. Isso é compatível com a segunda execução do StrictMode e também com o fim de um ciclo anterior. Não dá para cravar qual dos dois foi.

Trocar de rota não refaz o shell. O `loading` do mês desmonta a rota. Ao voltar, Parcelamentos e Simulador buscam outra vez. A causa é desmontagem, não dependência instável.

## 8. Payloads excessivos

Tamanhos abaixo são estruturais, calibrados pela contagem deste banco. Não são bytes medidos na rede.

| Endpoint | O que volta | O que a tela usa agora | Volume neste banco |
|---|---|---|---|
| `GET /invoices` | Fatura, template, itens, parcelas e compra | No Dashboard: nome, cor, vencimento, total, pago | 40 faturas, 85 itens, 147 parcelas |
| `GET /months/{y}/{m}` | 28–31 dias, transação com carteira, categorias e `linked_expense` | Gráfico: data e saldo. Ranking: descrição, valor, data, categoria, carteira | 73 transações em set/2026; 1 vínculo na base |
| `GET /months/{y}/{m}/categories` | `items` e `chart_items` de gastos e de ganhos | Dashboard: `chart_items` | Um objeto por grupo de categoria |
| `GET /receivables/expense-options` | Todo gasto, item e parcela, com categorias | Insight dentro de um modal ainda fechado | Cresce com o histórico inteiro |
| `GET /months/summary` | Um cartão por mês | Dashboard não lê | Cerca de 20 meses; a query lê as 569 transações |
| `POST /simulations/preview` | A resposta é um resumo | O servidor monta o mês cheio para obter três números | Um mês cheio por mês do intervalo |
| `GET /receivables` | Pessoa, categorias, pagamentos e gasto vinculado | A página Recebíveis usa; o Dashboard não | 7 registros |
| `GET /months/{y}/{m}/summary` | Cerca de onze números | Os cards | Pequeno. O excesso está nas queries, não no JSON |

## 9. Paginação

| Lista | Paginação | Limite | Carrega tudo? | O frontend usa tudo? | Classe |
|---|---|---|---|---|---|
| Transações do mês | Não | O mês inteiro | Sim | Meses sim. Dashboard usa o saldo diário e o top 5 de gastos | Problema potencial |
| Faturas, itens, parcelas | Não | Histórico completo | Sim | Faturas sim, porque já vieram. Dashboard não | Problema potencial |
| `expense-options` | Não | Histórico completo | Sim | Só no modal | Problema potencial |
| Recebíveis | Não | Todos | Sim | Na página Recebíveis, sim | Precisa avaliar (hoje são 7) |
| `GET /months/summary` | Não | Todos os meses | Sim | Meses e o horizonte do Simulador | Precisa avaliar; o conserto é agregar, não paginar |
| Categorias | Não | Todas | Sim | Sim, nos seletores | OK (20) |
| Carteiras | Não | Todas, inclusive arquivadas | Sim | A página sim | OK (7) |
| Parcelamentos | Sim | 12, máximo 48 | Não | A página corrente | OK |
| Movimentos da carteira | Sim | 10, máximo 50 | Não | A página corrente | OK |
| Simulações salvas | Não | Todas | Sim | A lista sim | OK (2) |
| Notificações | Não existe esse módulo | — | — | — | — |

## 10. Cache

Não há React Query, SWR, Zustand nem cache HTTP. O backend não guarda resultado entre requests. `localStorage` guarda token, idioma, tema, menu e rascunho do simulador, não respostas de API.

O único cache de API é:

- `priorityPayloads`, dentro de um único `refresh()`.
- `detailsRequestRef` no Dashboard e em Categorias, enquanto o breakdown não muda.

| Dados | Cache atual | Deveria ter cache? | Motivo |
|---|---|---|---|
| Dashboard | Estado do `AppShell` até mês ou idioma mudar | Sim, por mês | Trocar de aba e de rota não muda o dado |
| Resumo mensal | Dedup só no mesmo ciclo | Sim, por mês | O mês corrente é pedido duas vezes; ao andar um mês, cinco dos seis summaries já tinham vindo |
| Faturas | Estado do shell e upsert depois da escrita | Sim, por período e por fatura | `syncInvoiceCollections` baixa a lista inteira de novo |
| Itens de fatura | Dentro do objeto da fatura | Sim, por `invoiceId` | Reabrir não busca; o problema é ter buscado antes da hora |
| Categorias | Estado do shell até `refresh()` | Sim | Mudam pouco e entram em vários formulários |
| Carteiras | Estado do shell; a página busca de novo ao salvar | Sim | São poucas e o sync mensal as relê sem a tela de carteiras estar aberta |

Invalidação mínima sugerida:

- Lançamento invalida o mês e os summaries daquele mês.
- Item de fatura invalida aquela fatura e o mesmo mês.
- Categoria invalida a lista de categorias e os breakdowns visíveis.
- Carteira invalida a lista de carteiras e o saldo do mês aberto.

## 11. SQL e SQLAlchemy

Não há `joinedload` no código. O padrão é `selectinload`. Vários são necessários para o schema atual. Outros carregam relação que aquele request não precisa.

### Saldo inicial repetido

`_opening_balance` em `backend/app/routers/months.py` chama `wallet_balance` para cada carteira ativa. Cada `wallet_balance` faz quatro agregações (transações, ajustes, entradas, saídas). `serialize_wallets` já agrega a lista inteira em poucas queries; o saldo do mês não usa esse caminho.

No Dashboard o cálculo entra uma vez em `GET /months` e sete vezes nos summaries (seis da série mais a chamada solta). Com 7 carteiras, são cerca de 28 agregações por cálculo, oito vezes no mesmo ciclo. Isso é deduzido do código, não de um trace do MySQL.

### Mês completo onde basta o resumo

`POST /simulations/preview` percorre o intervalo e, para cada mês, chama `_build_month_data` e depois `_summarize_month_data`. O preview só guarda receita, despesa e fechamento. `_build_month_summary` já existe e não monta os dias. O intervalo pode chegar a 120 meses, e o frontend dispara isso no mount e 500 ms depois de cada edição.

### Eager load além do uso

`GET /months/{y}/{m}` faz `selectinload` de carteira, `category`, `categories` e três cadeias de `linked_expense` até template e categorias da compra. `category` e `categories` se sobrepõem. O ranking não mostra `linked_expense`.

`GET /invoices` faz `selectinload` de `items`, `template` e `installment_items.purchase`, sem filtro de período. `template` é necessário: `name` e `color` vêm dele. `Invoice.transactions` não é carregado, e o schema não pede. Esse ponto está certo.

O que falta, se os itens continuarem na lista:

- `InvoiceItem.categories` não entra no `selectinload`. O schema lê `categories`. O lazy load padrão dispara uma query por item (85 neste banco).
- Nas parcelas, `categories` vem de `purchase.categories`, e o load para em `purchase`. A mesma compra é reaproveitada no identity map, então o lazy load é por compra (22), não por parcela (147).

### Agregação na aplicação

`list_month_summaries` traz todas as transações, ajustes e transferências para a memória e agrupa em Python. A resposta é um cartão por mês. Dá para ser `GROUP BY` ano/mês.

O breakdown de categorias agrega em Python, aceitável no volume de um mês, e devolve duas árvores (`items` e `chart_items`) a partir das mesmas linhas.

`list_receivable_expense_options` carrega todos os recebíveis, todas as receitas, todos os gastos, todos os itens e todas as compras, e casa a alocação em Python. É o endpoint mais caro do bootstrap.

`list_installments_page` pagina a lista (12, teto 48) e ainda corre várias contagens e seis somas de previsão. A página está certa; o resumo pode ser uma agregação.

`list_receivables` pode dar `commit` ao sincronizar status durante um GET.

### Filtros

Os filtros de `user_id` estão presentes. O que falta é limite de período, status ou página nas listas históricas: faturas, opções de gasto, recebíveis e o cartão de todos os meses.

`serialize_wallet`, usado no detalhe de uma carteira, faz três queries. Para um id, está adequado. A lista usa `serialize_wallets`, que já evita N+1.

## 12. Problemas, com causa e recomendação

### Problema 1 — Pacote global em toda entrada

Onde: `AppShell.refresh()`.

Causa: depois do lote da rota, o mesmo `Promise.all` busca faturas, modelos, categorias, carteiras, dois breakdowns, orçamento, recebíveis, pessoas, opções de gasto, cartões de meses e seis summaries.

Impacto: Faturas, Recebíveis e Configurações ficam atrás de dados que a tela não desenha. No Dashboard, dez chamadas competem com o primeiro paint mesmo depois do skeleton cair.

Recomendação: buscar por rota. Manter no shell só o que a rota visível lê.

### Problema 2 — Summary do mês corrente duplicado

Onde: offsets `[-5..0]` mais `getMonthSummary(year, month)`.

Causa: o offset 0 é o mesmo ano e mês da chamada solta.

Impacto: duas idas ao banco para o mesmo saldo, em todo F5 e em toda troca de mês. Cada uma recalcula o saldo inicial.

Recomendação: uma chamada de intervalo. O card usa o último ponto da série.

### Problema 3 — Faturas com itens de todos os meses

Onde: `list_invoices` e o card de vencimentos.

Causa: `selectinload` de itens e parcelas, sem período. Accordion e Ver itens só leem o estado.

Impacto: 40 faturas trazem 85 itens e as parcelas para mostrar quatro campos de cinco faturas no Dashboard.

Recomendação: lista só com cabeçalho do período visível. Itens no Ver itens.

### Problema 4 — `expense-options` no bootstrap

Onde: `list_receivable_expense_options`, disparado por `refresh()`.

Causa: histórico inteiro e alocação em Python, para um seletor de modal.

Impacto: endpoint mais caro do pacote, invisível na Visão geral.

Recomendação: buscar ao abrir o seletor, ou só os gastos do mês visível.

### Problema 5 — Preview do simulador reconstrói cada mês

Onde: `preview_simulation` e o efeito de `SimulationPage`.

Causa: `_build_month_data` por mês do intervalo, até 120, no mount e a cada edição.

Recomendação: usar `_build_month_summary` e guardar os meses reais já calculados enquanto o rascunho muda.

### Problema 6 — Saldo inicial repetido por carteira

Onde: `_opening_balance` e `wallet_balance`.

Causa: quatro agregações por carteira, repetidas em cada summary.

Recomendação: um agregado para todas as carteiras, reutilizado pelo mês e pelos summaries.

### Problema 7 — Troca de idioma refaz a API

Onde: dependências de `refresh()`.

Causa: `language` dispara o efeito. Os rótulos são formatados no cliente.

Recomendação: tirar `language` das dependências e remontar os rótulos com os dados que já estão no estado.

### Problema 8 — Mutação refaz o fan-out mensal

Onde: `syncMonthCollections`, e `refresh()` completo ao excluir categoria ou modelo.

Causa: a resposta da escrita não atualiza o mês. O cliente rebusca summaries, breakdowns, orçamento, opções de gasto, cartões e carteiras.

Recomendação: aplicar a resposta no mês aberto e invalidar só summaries e breakdown daquele mês.

## 13. O que já está adequado

Vale preservar estes comportamentos ao mexer no resto:

- Parcelamentos paginados, com filtro na query.
- Movimentos de carteira paginados, carregados no clique.
- Detalhe de categoria com `include_details=true` só no clique, e reuso enquanto o breakdown não muda.
- Detalhe de parcelamento em `GET /installments/{id}`.
- Preview de consolidação de carteira só com o modal aberto.
- Upsert local da fatura depois de criar, editar item, pagar ou mudar vencimento.
- Accordion e Ver itens sem request, uma vez que os dados já estão na memória.
- Troca de rota sem refazer o shell.
- `Invoice.transactions` sem eager load, porque o schema não usa.
- `serialize_wallets` agregado, sem N+1 na lista.

## 14. Priorização

### Alta

Problemas que mudam o que o usuário espera na entrada e o quanto o banco trabalha por ciclo.

- Pacote global no F5.
- Summary duplicado e seis chamadas no lugar de um intervalo.
- `GET /invoices` com todos os itens.
- `GET /receivables/expense-options` no bootstrap.
- Preview do simulador em cima de `_build_month_data`.
- Saldo inicial recalculado oito vezes no mesmo Dashboard.

### Média

Melhorias claras, com a entrada já mais leve.

- Adiar histórico e categorias do Dashboard para o clique da aba.
- Tirar `language` do `refresh()`.
- Trocar `syncMonthCollections` por atualização do mês afetado.
- `selectinload` de categorias de item e de compra, se os itens continuarem na lista.
- Agregar `GET /months/summary` no banco.
- Cache em memória por mês, com invalidação na escrita.

### Baixa

- Remover as três funções de API sem caller, quando forem mesmo código morto.
- Paginar recebíveis, categorias e carteiras. O volume atual não justifica.
- Unificar `items` e `chart_items` num campo só, se a tela de limites puder usar o agrupamento do gráfico.
- Cancelar a request no cleanup do efeito, para a segunda onda do StrictMode em desenvolvimento. Em produção ela não ocorre.

## 15. Plano de ação

Cada etapa deve poder ir para produção sozinha. A medição do passo 1 é o que hoje está faltando para comparar o depois.

1. Medir no Network, autenticado, um roteiro fixo: F5 no Dashboard, troca para cada página principal, troca de mês, abrir Ver itens, abrir uma categoria, criar e excluir um lançamento. Guardar quantidade, status, duração e bytes. Separar API de assets estáticos.
2. Cortar do carregamento inicial o que a rota visível não desenha. Dashboard fica com mês, summary e cabeçalhos de faturas. Faturas deixa de esperar recebíveis e orçamento. Configurações deixa de esperar o pacote financeiro na aba Conta.
3. Carregar sob demanda: aba Histórico, aba Categorias, modelos, carteiras, recebíveis, pessoas e `expense-options`.
4. Reduzir payloads: faturas sem itens, mês do gráfico sem `linked_expense`, breakdown sem a árvore que a tela não lê.
5. Eliminar a duplicata do summary e substituir as seis chamadas por um intervalo. Reusar os meses vizinhos ao andar um mês.
6. Paginar ou filtrar por período faturas e opções de gasto. Parcelamentos e movimentos de carteira já estão adequados.
7. Cachear por mês no cliente e invalidar só o recorte da escrita. Parar de chamar `refresh()` completo ao excluir categoria ou modelo.
8. No SQL, agregar saldo e cartões de mês no banco, completar o `selectinload` que faltar se os itens continuarem embutidos, e trocar o preview do simulador para `_build_month_summary`.
9. Repetir o roteiro do passo 1 e comparar.

## 16. Recorte sugerido para a primeira implementação

Se for fazer uma única leva antes de medir de novo, o melhor recorte é o passo 2 mais a duplicata do summary:

- `refresh()` passa a receber a rota e só dispara o lote daquela rota.
- No Dashboard, o paint usa mês, summary do mês corrente, summary do mês anterior e uma lista curta de faturas em aberto (sem itens).
- A série de seis meses e o breakdown esperam o clique da aba.
- O offset 0 deixa de ser pedido de novo.

Isso ataca a espera do skeleton sem ainda mudar contratos de escrita, cache ou o simulador. O simulador e o saldo inicial ficam para a leva de SQL, porque o ganho deles aparece na duração do banco, que ainda não foi medida.

## 17. Referências no código

| Assunto | Onde olhar |
|---|---|
| Cliente HTTP | `frontend/src/api/api.js` |
| Pacote de carregamento | `frontend/src/components/layout/AppShell.jsx` (`refresh`, `syncMonthCollections`, `syncInvoiceCollections`) |
| Sessão | `frontend/src/hooks/useAuth.jsx` |
| StrictMode | `frontend/src/main.jsx` |
| Dashboard | `frontend/src/components/Dashboard.jsx` |
| Faturas | `frontend/src/pages/InvoicesPage.jsx` |
| Parcelamentos | `frontend/src/pages/InstallmentsPage.jsx` |
| Simulador | `frontend/src/pages/SimulationPage.jsx` |
| Carteiras | `frontend/src/pages/WalletsPage.jsx` |
| Mês, summary, breakdown, cartões | `backend/app/routers/months.py` |
| Saldo por carteira | `backend/app/services/wallets.py` (`wallet_balance`, `serialize_wallets`) |
| Lista de faturas | `backend/app/routers/invoices.py` |
| Opções de gasto | `backend/app/routers/receivables.py` |
| Preview | `backend/app/routers/simulations.py` |
| Página de parcelamentos | `backend/app/routers/installments.py` |
