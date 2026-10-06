import assert from 'node:assert/strict';
const { chromium } = await import(process.env.KASHY_E2E_PLAYWRIGHT_MODULE || 'playwright');
import { fileURLToPath } from 'node:url';
const webUrl = process.env.KASHY_E2E_WEB_URL || 'http://localhost:5173';
const apiUrl = process.env.KASHY_E2E_API_URL || 'http://localhost:8010/api';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.KASHY_E2E_CHROMIUM_PATH ? { executablePath: process.env.KASHY_E2E_CHROMIUM_PATH, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage'] } : {}),
});
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('kashy365-language', 'pt-BR'));
  async function select(scope, name, value, label) {
    const custom = scope.getByRole('button', { name, exact: true });
    if (await custom.isVisible()) {
      await custom.click();
      await page.getByRole('option', { name: label, exact: true }).click();
    } else {
      await scope.locator(`select[aria-label="${name}"]`).selectOption(value);
    }
  }
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  let videoRequests = 0;
  await page.route('https://media.example/**', async route => {
    const path = route.request().url();
    if (path.endsWith('.webm')) {
      videoRequests++;
      await route.fulfill({path:fileURLToPath(new URL('./fixtures/product-video.webm', import.meta.url)), contentType:'video/webm'});
    } else await route.fulfill({body:path.endsWith('.gif') ? gif : png, contentType:path.endsWith('.gif') ? 'image/gif' : 'image/png'});
  });
  async function labelsDoNotFocus(modal) {
    assert.equal(await modal.locator('label').count(), 0);
    for (const caption of await modal.locator('.field-label > span').all()) {
      await modal.getByRole('button', {name:'Cancelar', exact:true}).focus();
      await caption.click();
      const tag = await page.evaluate(() => document.activeElement.tagName);
      assert.ok(!['INPUT','TEXTAREA','SELECT'].includes(tag), `Label unexpectedly focused ${tag}`);
    }
  }
  const email = `planning${Date.now()}@example.com`;
  const password = 'Compra segura! 2026 long';
  const registered = await context.request.post(`${apiUrl}/auth/register`, { data: { name: 'Planejador', email, password } });
  assert.equal(registered.status(), 201, await registered.text());
  const token = (await registered.json()).access_token;
  const categoryResponse = await context.request.post(`${apiUrl}/categories`, {headers: {Authorization: `Bearer ${token}`}, data: {name: 'Tecnologia', color: '#64748B'}});
  assert.equal(categoryResponse.status(), 201);
  await page.goto(`${webUrl}/login`);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(`${webUrl}/`);
  await page.getByRole('link', { name: 'Produtos desejados', exact: true }).click();
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await labelsDoNotFocus(dialog);
  assert.equal(await dialog.getByRole('button', {name:'Buscar dados do link'}).count(), 0);
  await dialog.getByLabel('Link do produto', {exact:true}).fill('https://example.com/notebook');
  await dialog.getByLabel('Nome do produto *', { exact: true }).fill('Notebook Dell Inspiron 15');
  await dialog.getByRole('combobox', {name:'Categoria', exact:true}).click();
  await page.getByRole('listbox', {name:'Categoria', exact:true}).getByRole('option', {name:'Tecnologia', exact:true}).click();
  await dialog.getByLabel('Imagem do produto', { exact: true }).setInputFiles(fileURLToPath(new URL('../public/logo.png', import.meta.url)));
  await dialog.getByRole('img', { name: 'Prévia do produto' }).waitFor();
  await select(dialog, 'Prioridade', 'high', 'Alta');
  await dialog.getByLabel('Preço-alvo', { exact: true }).fill('3200,00');
  await dialog.getByRole('combobox', {name:'Categoria', exact:true}).click();
  await page.getByRole('button', {name:'Nova categoria', exact:true}).click();
  const nested = page.getByRole('dialog', {name:'Nova categoria', exact:true});
  await nested.getByPlaceholder('Ex: Alimentação, Transporte, Lazer...').fill('Eletrônicos');
  await nested.getByRole('button', {name:'Criar categoria', exact:true}).click();
  await nested.waitFor({state:'hidden'});
  assert.match(await dialog.getByRole('combobox', {name:'Categoria', exact:true}).textContent(), /Eletrônicos/);
  await dialog.getByRole('textbox', { name: 'Previsão de compra', exact: true }).fill('01112026');
  await dialog.getByRole('textbox', { name: 'Previsão de compra', exact: true }).press('Tab');
  await dialog.getByRole('textbox', { name: 'Previsão de compra', exact: true }).click();
  await page.locator('.date-days .selected').click();
  assert.equal(await dialog.getByRole('textbox', { name: 'Previsão de compra' }).inputValue(), '01/11/2026');
  await dialog.getByRole('button', { name: 'Criar produto', exact: true }).click();
  await page.waitForURL(/produtos-desejados\/\d+/);
  const productId = Number(page.url().split('/').at(-1));
  await page.getByRole('heading', { name: 'Ofertas (0)', exact: true }).waitFor();
  const savedProduct = async () => (await context.request.get(`${apiUrl}/desired-products/${productId}`, {headers:{Authorization:`Bearer ${token}`}})).json();
  assert.ok((await savedProduct()).image_data.startsWith('data:image/jpeg;base64,'));
  for (const [url, type] of [['https://media.example/photo.png', 'image'], ['https://media.example/photo.gif', 'image'], ['https://media.example/demo.webm', 'video']]) {
    await page.locator('.desired-actions').getByRole('button', {name:'Editar', exact:true}).click();
    dialog = page.getByRole('dialog');
    await select(dialog, 'Adicionar mídia por', 'url', 'URL');
    await dialog.getByLabel('URL da mídia', {exact:true}).fill(url);
    await select(dialog, 'Tipo de mídia', type, type === 'video' ? 'Vídeo' : 'Imagem ou GIF');
    await dialog.getByRole('button', {name:'Salvar alterações', exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.reload();
    await page.getByRole('heading', {name:'Ofertas (0)', exact:true}).waitFor();
    const saved = await savedProduct();
    assert.equal(saved.media_url, url);
    assert.equal(saved.media_type, type);
    assert.equal(saved.image_data, null);
    const media = page.locator(type === 'video' ? '.desired-detail-image video' : '.desired-detail-image img');
    assert.equal(await media.getAttribute(type === 'video' ? 'data-media-url' : 'src'), url);
    if (type === 'image') assert.ok(await media.evaluate(image => image.complete && image.naturalWidth > 0));
    else {
      assert.equal(await media.getAttribute('preload'), 'none');
      assert.equal(await media.getAttribute('autoplay'), null);
      assert.equal(videoRequests, 0, 'Video downloaded before playback');
      await page.locator('.desired-detail-image').getByRole('button', {name:'Reproduzir vídeo'}).click();
      await page.waitForFunction(() => { const video = document.querySelector('.desired-detail-image video'); return video && !video.paused && video.videoWidth > 0; });
      assert.ok(await media.evaluate(video => !video.paused && video.videoWidth > 0));
      assert.ok(videoRequests > 0);
      await media.evaluate(video => video.pause());
    }
  }
  await page.getByRole('button', {name:'Todos os produtos', exact:true}).click();
  assert.equal(await page.locator('.desired-cover video').getAttribute('data-media-url'), 'https://media.example/demo.webm');
  await page.getByRole('button', {name:'Ver produto', exact:true}).click();
  await page.getByRole('heading', {name:'Ofertas (0)', exact:true}).waitFor();
  async function offer(store, price, method, shipping = '') {
    await page.getByRole('button', { name: 'Adicionar oferta', exact: true }).first().click();
    const modal = page.getByRole('dialog');
    await labelsDoNotFocus(modal);
    await modal.getByLabel('Loja *', { exact: true }).fill(store);
    await modal.getByLabel('Link da oferta', { exact: true }).fill(`https://example.com/${store.toLowerCase().replaceAll(' ', '-')}`);
    await modal.getByLabel('Preço *', { exact: true }).fill(price);
    if (shipping) await modal.getByLabel('Frete', { exact: true }).fill(shipping);
    await select(modal, 'Pagamento', method, {credit: 'Cartão de crédito', pix: 'PIX', boleto: 'Boleto'}[method]);
    if (method === 'credit') {
      await modal.getByLabel('Quantidade de parcelas').fill('10');
      assert.match(await modal.getByLabel('Valor da parcela').inputValue(), /349,90/);
    }
    await modal.getByRole('button', { name: 'Adicionar oferta', exact: true }).click();
    await modal.waitFor({ state: 'hidden' });
  }
  await offer('Amazon', '3499,00', 'credit', '20,00');
  await offer('Mercado Livre', '3299,00', 'pix', '0,00');
  await offer('Kabum', '3399,00', 'boleto');
  await page.getByRole('heading', { name: 'Ofertas (3)', exact: true }).waitFor();
  let best = page.locator('.desired-offer.best');
  assert.match(await best.textContent(), /Mercado Livre/);
  assert.match(await page.locator('.desired-saving').textContent(), /220,00/);
  assert.match(await page.locator('.desired-target-note').textContent(), /99,00/);
  assert.equal(await best.getByRole('link', { name: 'Ver na loja' }).getAttribute('href'), 'https://example.com/mercado-livre');
  await best.getByRole('button', { name: 'Editar', exact: true }).click();
  dialog = page.getByRole('dialog');
  assert.equal(await dialog.getByLabel('Link da oferta').inputValue(), 'https://example.com/mercado-livre');
  await dialog.getByRole('textbox', { name: 'Data do preço' }).click();
  await page.locator('.date-days .selected').click();
  await dialog.getByLabel('Preço *', { exact: true }).fill('3199,00');
  await dialog.getByRole('button', { name: 'Salvar oferta', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('Seu preço-alvo foi atingido', { exact: true }).waitFor();
  best = page.locator('.desired-offer.best');
  await best.locator('summary').click();
  assert.equal(await best.locator('.desired-history li').count(), 2);
  await page.getByRole('button', { name: 'Marcar como comprado', exact: true }).click();
  dialog = page.getByRole('dialog');
  await labelsDoNotFocus(dialog);
  await dialog.getByRole('button', { name: 'Oferta escolhida', exact: true }).click();
  await page.getByRole('option', { name: /Mercado Livre/ }).click();
  await dialog.getByRole('textbox', { name: 'Data da compra' }).click();
  await page.locator('.date-days .selected').click();
  await dialog.getByLabel('Preço final pago *', { exact: true }).fill('3100,00');
  await select(dialog, 'Forma de pagamento', 'credit', 'Cartão de crédito');
  await dialog.getByLabel('Parcelas *', { exact: true }).fill('10');
  await dialog.getByRole('button', { name: 'Salvar compra', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.locator('.desired-purchase').getByText('Compra registrada', { exact: true }).waitFor();
  assert.match(await page.locator('.desired-purchase').textContent(), /10x de R\$\s*310,00/);
  await best.getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('heading', { name: 'Ofertas (2)', exact: true }).waitFor();
  await page.reload();
  await page.locator('.desired-purchase').getByText('Compra registrada', { exact: true }).waitFor();
  assert.match(await page.locator('.desired-purchase').textContent(), /Mercado Livre/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.desired-actions').getByRole('button', { name: 'Editar', exact: true }).click();
  dialog = page.getByRole('dialog');
  assert.ok(await dialog.locator('.date-native-input').isVisible());
  assert.ok(await dialog.locator('select[aria-label="Prioridade"]').isVisible());
  assert.equal(await dialog.getByLabel('URL da mídia').inputValue(), 'https://media.example/demo.webm');
  await dialog.getByRole('button', {name:'Remover mídia', exact:true}).click();
  await dialog.locator('.date-native-input').fill('2026-12-01');
  await select(dialog, 'Prioridade', 'low', 'Baixa');
  await dialog.locator('select[aria-label="Selecionar categoria"]').selectOption({label:'Tecnologia'});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile modal has horizontal overflow');
  await dialog.getByRole('button', { name: 'Salvar alterações' }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal((await savedProduct()).media_url, null);
  await page.getByRole('button', { name: 'Todos os produtos', exact: true }).click();
  await page.getByRole('button', { name: 'Ver produto', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page has horizontal overflow');
  await select(page, 'Status', 'abandoned', 'Desisti');
  await page.getByText('Nenhum produto encontrado', { exact: true }).waitFor();
  await select(page, 'Status', 'bought', 'Comprado');
  await page.getByRole('button', { name: 'Ver produto', exact: true }).click();
  await page.locator('.desired-purchase').getByText('Compra registrada', { exact: true }).waitFor();
  const foreign = await context.request.post(`${apiUrl}/auth/register`, { data: { name: 'Outra pessoa', email: `other${Date.now()}@example.com`, password } });
  assert.equal(foreign.status(), 201);
  const otherToken = (await foreign.json()).access_token;
  const denied = await context.request.get(`${apiUrl}/desired-products/${productId}`, { headers: { Authorization: `Bearer ${otherToken}` } });
  assert.equal(denied.status(), 404);
  await page.locator('.desired-actions').getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click();
  await page.getByText('Sua lista começa aqui', { exact: true }).waitFor();
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('PASS: login, category selection/creation, direct image/GIF/video URLs, labels without focus, image upload, product, 3 offers, automatic installments, comparison, target, edit/history, purchase, archived offer, persistence, mobile filters, cross-user isolation and deletion.');
} finally {
  await browser.close();
}
