# Produtos desejados / planejamento de compras

O módulo fica em `/produtos-desejados` e no menu do Kashy. Um produto representa
uma intenção de compra; cada condição de pagamento de uma loja pode ser uma
oferta independente. Todos os endpoints exigem o JWT já utilizado pelo sistema.

## Dados e regras

- `DesiredProduct`: usuário, nome, categoria do usuário (`category_id`), EAN/GTIN, URL de origem, observações, imagem enviada ou mídia por URL,
  prioridade, preço-alvo, previsão, status e dados da compra concluída.
- `ProductOffer`: produto, loja, URL HTTP(S), preço, frete, pagamento,
  parcelamento, observações, data do preço e origem (`manual` ou `serpapi`).
- `OfferPriceHistory`: registro acrescentado no cadastro e quando preço, frete
  ou condições de pagamento mudam. Guarda os valores anteriores, data informada,
  momento do registro, origem e custo total; edições de observações não duplicam
  o histórico. Uma correção apenas da data atualiza a data do último snapshot, sem
  criar um preço fictício. A API não oferece operações diretas de edição de registros históricos.

Na interface, o histórico exibido em cada oferta consolida os snapshots da mesma
loja no produto, com comparação de nome sem diferenciar maiúsculas, minúsculas ou
espaços excedentes. Isso inclui ofertas vencidas ou arquivadas, preservando a linha
do tempo da loja sem misturar preços de estabelecimentos diferentes.

Valores são `Decimal`/`Numeric(10, 2)` e strings decimais no JSON deste módulo.
Entradas com mais de duas casas decimais, valores negativos ou acima do limite
do banco são rejeitadas. Parcelas são calculadas com `ROUND_HALF_UP`, e podem ser
ajustadas manualmente. A comparação sempre usa **preço + frete**; parcelas
arredondadas não alteram o ranking. Informe o preço total da condição escolhida,
inclusive juros, para compará-la com outras condições. Frete não informado entra
como zero e aparece explicitamente como não informado na interface.

Menor/maior custo e economia consideram ofertas não excluídas registradas nos
últimos 30 dias. Ofertas mais antigas continuam visíveis e com histórico acessível,
mas são marcadas como preço vencido e não entram no ranking nem na verificação do
preço-alvo. Em empates, a oferta mais antiga é destacada. O preço-alvo é comparado
ao menor custo atual.

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

## Mídia e formulários

O campo de mídia aceita uma URL e tem um botão de upload ao lado, sem seleção de fonte ou tipo.
Upload aceita PNG, JPEG e WebP estático de até 10 MB; a interface redimensiona
para até 1000 px e converte para JPEG. O backend verifica base64, assinatura,
formato e limite de 1 MB. GIF, vídeo e imagens animadas embutidas são rejeitados.

`media_url` armazena somente o endereço HTTP(S), sem credenciais; `media_type`
guarda `image` (inclui GIF) ou `video`, detectado pela extensão (incluindo nomes em query strings) ou pelo carregamento no navegador. O navegador exibe a mídia diretamente,
sem download pelo backend. Vídeos usam um player personalizado, `autoPlay`, `muted`,
`loop` e `playsInline`, com botões para pausar/reproduzir e ativar o som. GIFs
são exibidos diretamente e animam ao carregar. Autoplay bloqueado mantém o botão de reprodução manual. Use URL direta do arquivo, não link de página ou embed.
Falhas no carregamento exibem feedback na prévia, no card e nos detalhes.
Upload e URL são fontes exclusivas; trocar a fonte limpa a anterior ao salvar.
O editor permite mostrar a mídia inteira (`contain`) ou preencher a área (`cover`),
zoom de 1 a 3, posição horizontal/vertical de 0 a 100, arraste com mouse/toque,
controles acessíveis por teclado e restauração. `media_frame` guarda `{fit,x,y,zoom}`.
A prévia, os cards e os detalhes usam uma área 16:9 com as mesmas regras,
sem distorcer a proporção original. Produtos antigos usam contain, centro e zoom 1.
Imagens já gravadas continuam disponíveis; `image_source` identifica upload ou URL.

Links do produto (`source_url`) e das ofertas continuam editáveis e clicáveis.
Nome, EAN/GTIN e descrição do produto continuam sendo preenchidos manualmente.
As legendas dos modais não ativam os campos ao clicar; os nomes acessíveis são
mantidos por `aria-label`. Categoria, demais seletores e datas reutilizam componentes existentes.

## Pesquisa automática de ofertas

Na tela de detalhes, **Buscar ofertas** consulta o Google Shopping por meio da
SerpApi usando o nome do produto e, quando disponível, seu EAN/GTIN. A consulta
retorna no máximo 10 resultados com loja, preço, entrega, parcelamento, avaliação,
imagem e link quando esses dados estiverem disponíveis no provedor.

A busca é localizada para o Brasil com `gl=br`, `google_domain=google.com.br` e
`hl=pt-br`. Resultados agregados inicialmente apontam para uma página do Google;
ao abrir ou selecionar uma oferta, o backend consulta apenas aquele produto na
API de produto imersivo e resolve o endereço direto do lojista. Essa resolução
sob demanda evita consumir uma consulta adicional para cada item da lista.

Selecionar um resultado não grava dados automaticamente: a interface abre o
editor normal de oferta já preenchido para o usuário revisar preço, frete,
pagamento e data. Somente a confirmação cria a oferta, com origem `serpapi`.
Valores de terceiros podem estar desatualizados, por isso o link da loja fica
disponível para conferência.

A credencial nunca é enviada ao navegador. Configure `SERPAPI_API_KEY` apenas no
backend (localmente no `.env` e, em produção, nas variáveis do Railway). O backend
usa cache curto, timeout e limite de requisições configuráveis por
`SERPAPI_CACHE_SECONDS`, `SERPAPI_TIMEOUT_SECONDS`,
`OFFER_SEARCH_RATE_LIMIT_REQUESTS` e `OFFER_SEARCH_RATE_LIMIT_WINDOW_SECONDS`.
Sem a chave, a pesquisa responde como indisponível e o cadastro manual continua funcionando.

## API

Prefixo: `/api/desired-products`.

| Método | Caminho | Ação |
| --- | --- | --- |
| GET / POST | vazio | Listar / criar produtos |
| GET / PATCH / DELETE | `/{product_id}` | Consultar / editar / excluir produto |
| GET | `/{product_id}/offer-search?q=...&limit=10` | Pesquisar ofertas externas pela SerpApi |
| POST | `/{product_id}/offer-search/resolve` | Resolver a oferta escolhida para o site direto do lojista |
| POST | `/{product_id}/offers` | Adicionar oferta ao mesmo produto |
| PUT / DELETE | `/{product_id}/offers/{offer_id}` | Editar / remover oferta |
| POST | `/{product_id}/purchase` | Marcar comprado / atualizar dados da compra |

Os estados são `want`, `planning`, `ready`, `bought`, `abandoned`; prioridades:
`low`, `medium`, `high`; pagamento: `cash`, `pix`, `credit`, `boleto`, `other`.
Cartão exige de 1 a 60 parcelas; os demais pagamentos não aceitam parcelamento.

## Evoluções previstas

O serviço `app/services/desired_products.py` centraliza cálculo e registro de histórico.
Uma análise financeira futura pode consumir preço, frete, parcelas e previsão,
consultando renda, despesas, cartões e orçamento do mesmo usuário. O registro
de compra preservado fornece os dados para uma futura conversão em despesa,
que deverá ser uma ação explícita e idempotente. A pesquisa opcional usa a SerpApi,
mas o módulo não cria transações, análise financeira automática, scraping direto,
alertas ou IA.

## Migration e validação

A migration `0039_desired_products` sucede `0038_invoice_planned_payment`;
`0040_product_import` acrescenta categoria vinculada, EAN/GTIN e URL de origem.
`0041_product_media` acrescenta URL e tipo da mídia, preservando imagens existentes.
`0042_product_media_frame` acrescenta o enquadramento em JSON, sem alterar URLs ou imagens anteriores.
`0043_fix_offer_history_dates` corrige as datas dos snapshots existentes a partir da data informada nas ofertas.
A migração associa rótulos antigos a categorias de mesmo nome apenas do mesmo usuário.
O entrypoint existente executa `python -m alembic upgrade head` antes de iniciar
a API. Para instalar dependências de testes:

```sh
cd backend
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -p "test_desired_products.py" -v
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
servidores locais. `KASHY_E2E_CHROMIUM_PATH` permite usar um Chromium já instalado.
O roteiro intercepta apenas o transporte de arquivos remotos com fixtures locais;
frontend, autenticação, banco e API seguem reais. A fixture de vídeo WebM foi gerada
com FFmpeg a partir de um padrão vertical de teste, sem ativos externos.

Validação: testes de API/migration, interface/componentes/navegação, build Vite e
roteiro Chromium desktop/mobile com autoplay, controles, enquadramento, persistência e
fontes de mídia. Upgrade/downgrade executado em SQLite e SQL gerado para MySQL,
sem servidor MySQL nesta validação.
