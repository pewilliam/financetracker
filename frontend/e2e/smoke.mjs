import assert from 'node:assert/strict';
const { chromium } = await import(process.env.KASHY_E2E_PLAYWRIGHT_MODULE || 'playwright');
const webUrl = process.env.KASHY_E2E_WEB_URL || 'http://127.0.0.1:4173';
const apiUrl = process.env.KASHY_E2E_API_URL || 'http://127.0.0.1:8010/api';
const browser = await chromium.launch({headless: true,
  ...(process.env.KASHY_E2E_CHROMIUM_PATH ? {executablePath: process.env.KASHY_E2E_CHROMIUM_PATH, args: ['--no-sandbox', '--no-zygote', '--single-process', '--disable-dev-shm-usage']} : {})});
try {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}, locale: 'pt-BR'});
  await context.route('https://fonts.googleapis.com/**', route => route.fulfill({contentType: 'text/css', body: ''}));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') {errors.push(message.text()); console.error('Browser console:', message.text());}});
  page.on('response', response => {if (response.url().includes('/api/') && response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);});
  await page.addInitScript(() => localStorage.setItem('kashy365-language', 'pt-BR'));
  const email = `regression${Date.now()}@example.com`;
  const password = 'Compra segura! 2026 long';
  const registration = await context.request.post(`${apiUrl}/auth/register`, {data: {name: 'Teste de regressão', email, password}});
  assert.equal(registration.status(), 201, await registration.text());
  await page.goto(`${webUrl}/login`);
  await page.getByLabel('E-mail', {exact: true}).fill(email);
  await page.getByLabel('Senha', {exact: true}).fill(password);
  await page.getByRole('button', {name: 'Entrar', exact: true}).click();
  await page.waitForURL(`${webUrl}/`);
  const assertCustomScrollbar = async locator => {
    const style = await locator.evaluate(node => CSS.supports('selector(::-webkit-scrollbar)')
      ? getComputedStyle(node, '::-webkit-scrollbar').width
      : getComputedStyle(node).scrollbarWidth);
    assert.ok(style === '4px' || style === 'thin', `Unexpected scrollbar: ${style}`);
  };
  const routes = ['/', '/meses', '/categorias', '/carteiras', '/produtos-desejados', '/faturas', '/cartoes', '/parcelamentos', '/assinaturas', '/simulador', '/recebiveis', '/configuracoes'];
  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(webUrl + route);
      await page.locator('main').waitFor();
      await page.waitForLoadState('networkidle');
      await page.locator('.period-loading').waitFor({state: 'hidden'});
      assert.equal(new URL(page.url()).pathname, route);
      assert.ok((await page.locator('main').innerText()).length > 50, `Empty page: ${route}`);
      await assertCustomScrollbar(page.locator('html'));
    }
  }
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(webUrl + '/configuracoes');
  assert.equal(await page.locator('.sidebar').isVisible(), true);
  assert.equal(await page.locator('.bottom-navigation').isVisible(), false);
  await page.evaluate(() => localStorage.setItem('kashy365-navigation-mode', 'dock'));
  await page.reload();
  await page.locator('.app-layout.navigation-dock').waitFor();
  assert.equal(await page.locator('.sidebar').isVisible(), false);
  assert.equal(await page.locator('.bottom-navigation').isVisible(), true);
  await page.evaluate(() => localStorage.setItem('kashy365-navigation-mode', 'sidebar'));
  await page.reload();
  await page.setViewportSize({width: 390, height: 844});
  await page.goto(webUrl + '/carteiras');
  await page.getByRole('button', {name: 'Nova carteira', exact: true}).click();
  const modal = page.locator('.wallet-editor-modal');
  await modal.waitFor();
  await assertCustomScrollbar(modal);
  await modal.getByPlaceholder('Ex: Conta principal').fill('Carteira de regressão');
  await modal.getByPlaceholder('Ex: Nubank').fill('Banco de teste');
  await modal.getByRole('button', {name: 'Salvar carteira', exact: true}).click();
  await modal.waitFor({state: 'hidden'});
  await page.getByText('Carteira de regressão', {exact: true}).waitFor();
  await page.reload();
  await page.getByText('Carteira de regressão', {exact: true}).waitFor();
  assert.deepEqual(failedRequests, [], 'API requests failed');
  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('PASS: login, 12 authenticated pages on desktop/mobile, page/modal custom scrollbars, wallet creation and persistence; no API failures or browser exceptions.');
} finally {
  await browser.close();
}
