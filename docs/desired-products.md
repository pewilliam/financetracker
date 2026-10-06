# Produtos desejados / planejamento de compras

O módulo fica em `/produtos-desejados` e no menu do Kashy. Um produto representa
uma intenção de compra; cada condição de pagamento de uma loja pode ser uma
oferta independente. Todos os endpoints exigem o JWT já utilizado pelo sistema.

## Dados e regras

- `DesiredProduct`: usuário, nome, categoria do usuário (`category_id`), EAN/GTIN, URL de origem, observações, imagem enviada ou mídia por URL,
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

## Mídia e formulários

O seletor “Adicionar mídia por” permite upload de imagem ou URL direta.
Upload aceita PNG, JPEG e WebP estático de até 10 MB; a interface redimensiona
para até 1000 px e converte para JPEG. O backend verifica base64, assinatura,
formato e limite de 1 MB. GIF, vídeo e imagens animadas embutidas são rejeitados.

`media_url` armazena somente o endereço HTTP(S), sem credenciais; `media_type`
seleciona `image` (inclui GIF) ou `video`. O navegador exibe a mídia diretamente,
sem download pelo backend. Vídeos usam controles, `playsInline`, `preload="none"`
e não iniciam automaticamente. Use URL direta do arquivo, não link de página ou embed.
Falhas no carregamento exibem feedback na prévia, no card e nos detalhes.
Upload e URL são fontes exclusivas; trocar a fonte limpa a anterior ao salvar.
Imagens já gravadas continuam disponíveis; `image_source` identifica upload ou URL.

Links do produto (`source_url`) e das ofertas continuam editáveis e clicáveis.
A busca de metadados foi removida por completo, inclusive endpoint e serviço;
nome, EAN/GTIN, descrição, loja e preços são preenchidos manualmente.
As legendas dos modais não ativam os campos ao clicar; os nomes acessíveis são
mantidos por `aria-label`. Categoria, demais seletores e datas reutilizam componentes existentes.

## API

Prefixo: `/api/desired-products`.

| Método | Caminho | Ação |
| --- | --- | --- |
| GET / POST | vazio | Listar / criar produtos |
| GET / PATCH / DELETE | `/{product_id}` | Consultar / editar / excluir produto |
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
que deverá ser uma ação explícita e idempotente. O MVP não cria transações,
análise financeira automática, scraping complexo, alertas, APIs de comparação ou IA.

## Migration e validação

A migration `0039_desired_products` sucede `0038_invoice_planned_payment`;
`0040_product_import` acrescenta categoria vinculada, EAN/GTIN e URL de origem.
`0041_product_media` acrescenta URL e tipo da mídia, preservando imagens existentes.
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
com FFmpeg a partir de uma cor sólida, sem ativos externos.

Validação desta alteração: 9 testes de API/migrations, 6 testes de categorias,
17 testes de interface/navegação, build Vite, SQL MySQL e roteiro Chromium desktop/mobile.
Upgrade/downgrade executado em SQLite e compilado para MySQL, sem servidor MySQL nesta validação.
