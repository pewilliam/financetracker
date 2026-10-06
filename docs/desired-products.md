# Produtos desejados / planejamento de compras

O módulo fica em `/produtos-desejados` e no menu do Kashy. Um produto representa
uma intenção de compra; cada condição de pagamento de uma loja pode ser uma
oferta independente. Todos os endpoints exigem o JWT já utilizado pelo sistema.

## Dados e regras

- `DesiredProduct`: usuário, nome, categoria do usuário (`category_id`), EAN/GTIN, URL de origem, observações, imagem manual ou importada,
  prioridade, preço-alvo, previsão, status e dados da compra concluída.
- `ProductOffer`: produto, loja, URL HTTP(S), preço, frete, pagamento,
  parcelamento, observações, data do preço e origem (`manual` no MVP).
- `OfferPriceHistory`: registro acrescentado no cadastro e quando preço, frete
  ou condições de pagamento mudam. Guarda os valores anteriores, data informada,
  momento do registro, origem e custo total; edições de observações não duplicam
  o histórico. A API não oferece operações de edição de registros históricos.

Valores são `Decimal`/`Numeric(10, 2)` e strings decimais no JSON deste módulo.
Entradas com mais de duas casas decimais, valores negativos ou acima do limite
do banco são rejeitadas. Parcelas são calculadas com `ROUND_HALF_UP`, e podem ser
ajustadas manualmente. A comparação sempre usa **preço + frete**; parcelas
arredondadas não alteram o ranking. Informe o preço total da condição escolhida,
inclusive juros, para compará-la com outras condições. Frete não informado entra
como zero e aparece explicitamente como não informado na interface.

Menor/maior custo e economia consideram ofertas ativas do mesmo produto. Em
empates, a oferta mais antiga é destacada. O preço-alvo é comparado ao menor custo.

Remover uma oferta a arquiva (`deleted_at`) e retira da comparação, preservando
o histórico. Excluir o produto remove suas ofertas e históricos. A compra guarda
o ID e uma cópia da oferta escolhida, loja, preço final, data, forma de pagamento
e parcelas; mudanças posteriores ou arquivamento da oferta não alteram a compra.
Voltar de `bought` para outro status limpa os dados dessa compra. Para marcar
como comprado, use a ação dedicada que coleta os dados obrigatórios.

As consultas sempre filtram o produto por `user_id` do JWT. Ofertas e histórico
são acessados somente pelo produto autorizado. IDs inexistentes, de outro
produto ou de outro usuário retornam 404. Campos de propriedade não podem ser definidos pelo cliente. Categorias selecionadas
também são validadas pelo usuário do JWT; renomear a categoria atualiza o rótulo exibido.
A exclusão da categoria limpa o vínculo, preservando o produto. Rótulos antigos sem vínculo
continuam disponíveis no seletor até o usuário escolher uma categoria cadastrada.

## Imagens

A interface aceita PNG, JPEG e WebP de até 10 MB, redimensiona para até 1000 px
e converte para JPEG; o backend aceita imagens embutidas de até 1 MB, verificando
formato, base64 e assinatura. A imagem fica no produto (LONGTEXT no MySQL), sem
serviço de arquivos ou dependências adicionais. `image_source` distingue imagem manual e importada por URL.
Imagens importadas usam o mesmo limite e ficam embutidas: abrir o produto não consulta a loja novamente.

## API

Prefixo: `/api/desired-products`.

| Método | Caminho | Ação |
| --- | --- | --- |
| GET / POST | vazio | Listar / criar produtos |
| GET / PATCH / DELETE | `/{product_id}` | Consultar / editar / excluir produto |
| POST | `/import-url` | Prévia autenticada dos dados de uma URL, sem gravar produto/oferta |
| POST | `/{product_id}/offers` | Adicionar oferta ao mesmo produto |
| PUT / DELETE | `/{product_id}/offers/{offer_id}` | Editar / remover oferta |
| POST | `/{product_id}/purchase` | Marcar comprado / atualizar dados da compra |

Os estados são `want`, `planning`, `ready`, `bought`, `abandoned`; prioridades:
`low`, `medium`, `high`; pagamento: `cash`, `pix`, `credit`, `boleto`, `other`.
Cartão exige de 1 a 60 parcelas; os demais pagamentos não aceitam parcelamento.

## Evoluções previstas

O serviço `app/services/desired_products.py` centraliza cálculo e registro de histórico.
`app/services/product_metadata.py` lê a página indicada pelo usuário: JSON-LD/Schema.org,
Open Graph e metadados HTML/title. Sugere nome, EAN/GTIN, descrição, imagem, loja,
preço e moeda quando disponíveis. Não executa JavaScript ou navega por outras lojas.
Lojas que exigem autenticação, CAPTCHA ou execução de scripts podem exigir preenchimento manual.

O formulário mostra uma prévia e só aplica os valores após “Usar dados encontrados”.
Campos ausentes preservam o preenchimento anterior; o usuário pode corrigir tudo antes de salvar.
Preço de oferta só é aplicado automaticamente quando a moeda informada é BRL.
Imagens são baixadas pelo backend, com fallback manual caso falhem ou excedam o limite.
Não há busca automática, alertas, API paga ou IA.

As requisições aceitam apenas HTTP/HTTPS públicos e portas padrão, sem credenciais.
O serviço rejeita IPs locais/privados, reservados e multicast, incluindo respostas DNS mistas.
Conecta diretamente ao IP validado, verificando TLS pelo hostname original, e revalida
cada redirecionamento. Não usa proxy de ambiente ou cookies do usuário. Há limites de
redirecionamentos, tamanho (HTML 2 MB, imagem 1 MB) e tempo de conexão/leitura.
A resolução DNS usa o resolvedor do sistema e seus limites de tempo.

Uma análise financeira futura pode consumir preço, frete, parcelas e previsão,
consultando renda, despesas, cartões e orçamento do mesmo usuário. O registro
de compra preservado fornece os dados para uma futura conversão em despesa,
que deverá ser uma ação explícita e idempotente. O MVP não cria transações,
análise financeira automática, scraping complexo, alertas, APIs de comparação ou IA.

## Migration e validação

A migration `0039_desired_products` sucede `0038_invoice_planned_payment`;
`0040_product_import` acrescenta categoria vinculada, EAN/GTIN e URL de origem.
A migração associa rótulos antigos a categorias de mesmo nome apenas do mesmo usuário.
O entrypoint existente executa `python -m alembic upgrade head` antes de iniciar
a API. Para instalar dependências de testes:

```sh
cd backend
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -p "test_desired_products.py" -v
python -m unittest discover -s tests -p "test_product_metadata.py" -v
```

```sh
cd frontend
npm ci
npm test -- src/pages/DesiredProductsPage.test.jsx
npm run build
```

Testes HTTP usam JWT real e SQLite isolado para verificar CRUD, histórico,
compra, autorização e dinheiro. O teste da migration executa upgrade/downgrade
e compara suas colunas com os modelos. O SQL da migration também pode ser
gerado no dialeto MySQL sem alterar um banco:

```sh
cd backend
python -m alembic upgrade 0038_invoice_planned_payment:head --sql
```


O roteiro `frontend/e2e/desired-products.mjs` executa login, imagem manual, três
ofertas, parcelamento automático, comparação, edição/histórico, compra, remoção
com preservação, recarga, filtros mobile, isolamento e exclusão final no Chromium
com frontend e API reais. Execute em um ambiente local com banco de testes. Ele
cria contas descartáveis. Playwright é opcional para esse roteiro, sem dependência
nova em produção:

```sh
cd frontend
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node e2e/desired-products.mjs
```

As variáveis `KASHY_E2E_WEB_URL` e `KASHY_E2E_API_URL` permitem escolher os
servidores locais. `KASHY_E2E_IMPORT_URL` habilita a etapa de importação com uma
página de fixture contendo EAN `7891234567895`, descrição “Descrição da loja”, loja
“Loja fixture”, preço em BRL e imagem PNG/JPEG/WebP. Em testes isolados pode-se substituir
apenas o transporte HTTP externo pelo conteúdo dessa fixture; o parser e a API seguem reais.
`KASHY_E2E_CHROMIUM_PATH` permite usar um Chromium já instalado.

Validação inicial (PR #94): 6 testes novos de API/migration, 4 testes novos da interface,
4 testes de navegação existentes e o roteiro completo em Chromium (desktop
1440 px e mobile 390 px) passaram; build Vite e geração de SQL MySQL passaram.
A migration foi executada em SQLite e compilada para MySQL; não foi aplicada a
um servidor MySQL nesta validação. Ao comparar a suíte completa com a base
`80e34ca`, as mesmas falhas preexistentes ocorreram nos testes de assinaturas
(19 falhas e 4 erros) e em 3 testes de idioma do dashboard de carteiras, sem
novas falhas introduzidas pelo módulo.


Validação da importação e categorias: 8 testes de API/migrations, 6 testes de metadados/SSRF,
6 testes existentes de categorias e 16 testes de interface/navegação. Upgrade/downgrade
executado em SQLite com dados antigos e SQL compilado para MySQL. O roteiro no Chromium
verifica também seleção/criação de categoria e importação confirmada de produto/oferta.
