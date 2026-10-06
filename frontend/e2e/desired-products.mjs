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
  const email = `planning${Date.now()}@example.com`;
  const password = 'Compra segura! 2026 long';
  const registered = await context.request.post(`${apiUrl}/auth/register`, { data: { name: 'Planejador', email, password } });
  assert.equal(registered.status(), 201, await registered.text());
  await page.goto(`${webUrl}/login`);
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(`${webUrl}/`);
  await page.getByRole('link', { name: 'Produtos desejados', exact: true }).click();
  await page.getByRole('button', { name: 'Novo produto', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nome do produto *', { exact: true }).fill('Notebook Dell Inspiron 15');
  await dialog.getByLabel('Categoria', { exact: true }).fill('Tecnologia');
  await dialog.getByLabel('Imagem do produto', { exact: true }).setInputFiles(fileURLToPath(new URL('../public/logo.png', import.meta.url)));
  await dialog.getByRole('img', { name: 'Prévia do produto' }).waitFor();
  await dialog.getByLabel('Prioridade').selectOption('high');
  await dialog.getByLabel('Preço-alvo', { exact: true }).fill('3200,00');
  await dialog.getByLabel('Previsão de compra', { exact: true }).fill('2026-11-01');
  await dialog.getByRole('button', { name: 'Criar produto', exact: true }).click();
  await page.waitForURL(/produtos-desejados\/\d+/);
  const productId = Number(page.url().split('/').at(-1));
  await page.getByRole('heading', { name: 'Ofertas (0)', exact: true }).waitFor();
  async function offer(store, price, method, shipping = '') {
    await page.getByRole('button', { name: 'Adicionar oferta', exact: true }).first().click();
    const modal = page.getByRole('dialog');
    await modal.getByLabel('Loja *', { exact: true }).fill(store);
    await modal.getByLabel('Link da oferta', { exact: true }).fill(`https://example.com/${store.toLowerCase().replaceAll(' ', '-')}`);
    await modal.getByLabel('Preço *', { exact: true }).fill(price);
    if (shipping) await modal.getByLabel('Frete', { exact: true }).fill(shipping);
    await modal.getByLabel('Pagamento').selectOption(method);
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
  await best.getByRole('button', { name: 'Editar', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Preço *', { exact: true }).fill('3199,00');
  await dialog.getByRole('button', { name: 'Salvar oferta', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByText('Seu preço-alvo foi atingido', { exact: true }).waitFor();
  best = page.locator('.desired-offer.best');
  await best.locator('summary').click();
  assert.equal(await best.locator('.desired-history li').count(), 2);
  await page.getByRole('button', { name: 'Marcar como comprado', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Preço final pago *', { exact: true }).fill('3100,00');
  await dialog.getByLabel('Forma de pagamento').selectOption('credit');
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
  await page.getByRole('button', { name: 'Todos os produtos', exact: true }).click();
  await page.getByRole('button', { name: 'Ver produto', exact: true }).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page has horizontal overflow');
  await page.getByLabel('Status').selectOption('abandoned');
  await page.getByText('Nenhum produto encontrado', { exact: true }).waitFor();
  await page.getByLabel('Status').selectOption('bought');
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
  console.log('PASS: login, image upload, product, 3 offers, automatic installments, comparison, target, edit/history, purchase, archived offer, persistence, mobile filters, cross-user isolation and deletion.');
} finally {
  await browser.close();
}
