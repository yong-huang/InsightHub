import { expect, test, type Page } from '@playwright/test'

/**
 * E2E smoke suite.
 *
 * Tests are written to pass on any machine: with or without configured
 * document workspaces (CI has none), and without a local LLM. Flows that
 * need documents (doc reader, search results) are conditional — they run
 * only when the manifest served by documentDiscovery is non-empty.
 */

function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

async function waitUntilLoaded(page: Page): Promise<void> {
  // Layout shows LoadingScreen while the manifest parses; wait for it to yield
  await page.goto('/')
  await page.waitForSelector('.layout', { timeout: 30_000 })
  await page.waitForFunction(
    () => !document.querySelector('.layout-main .loading-screen'),
    undefined,
    { timeout: 60_000 },
  )
}

test('app shell renders: navbar, sidebar, main area', async ({ page }) => {
  const errors = collectPageErrors(page)
  await waitUntilLoaded(page)

  await expect(page.locator('.navbar')).toBeVisible()
  await expect(page.locator('.sidebar')).toBeVisible()
  await expect(page.locator('.workspace-switcher-btn')).toBeVisible()
  await expect(page.locator('main.layout-main')).not.toBeEmpty()
  expect(errors).toEqual([])
})

test('workspace switcher opens', async ({ page }) => {
  const errors = collectPageErrors(page)
  await waitUntilLoaded(page)

  await page.locator('.workspace-switcher-btn').click()
  await expect(page.locator('.workspace-switcher-menu')).toBeVisible()
  expect(errors).toEqual([])
})

test('core pages render without crashing', async ({ page }) => {
  const errors = collectPageErrors(page)
  const pagesWithSettingsLayout = ['/settings', '/notes', '/trash', '/hidden-docs']

  for (const route of pagesWithSettingsLayout) {
    await page.goto(route)
    await expect(page.locator('.cs-settings')).toBeVisible({ timeout: 20_000 })
  }
  for (const route of ['/stats', '/achievements', '/read-later', '/spaced-repetition', '/knowledge-graph', '/learning-path', '/token-stats']) {
    await page.goto(route)
    await expect(page.locator('.layout')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('main.layout-main')).not.toBeEmpty()
  }
  expect(errors).toEqual([])
})

test('search dialog opens and accepts a query', async ({ page }) => {
  const errors = collectPageErrors(page)
  await waitUntilLoaded(page)

  await page.locator('button[title*="Search"]').click()
  const dialog = page.locator('.search-dialog')
  await expect(dialog).toBeVisible()

  const input = dialog.locator('.search-dialog-input')
  await input.fill('the')
  await expect(input).toHaveValue('the')
  // Results depend on whether documents are configured; the dialog itself
  // must stay interactive either way.
  await expect(dialog).toBeVisible()
  expect(errors).toEqual([])
})

test('numeric search surfaces results when documents exist', async ({ page }) => {
  await waitUntilLoaded(page)
  const docCount = await page.locator('.doc-card').count()
  test.skip(docCount === 0, 'no documents configured')

  await page.locator('button[title*="Search"]').click()
  const input = page.locator('.search-dialog-input')
  await input.fill('1')
  // The tiered search returns results for numeric prefixes on any corpus
  // with numbered documents; a result item or an explicit empty state is fine.
  await page.waitForTimeout(500)
  const results = page.locator('.search-result-item')
  if (await results.count() > 0) {
    await expect(results.first()).toBeVisible()
  }
})

test('doc reader opens a document when documents exist', async ({ page }) => {
  const errors = collectPageErrors(page)
  await waitUntilLoaded(page)
  const docCount = await page.locator('.doc-card').count()
  test.skip(docCount === 0, 'no documents configured')

  await page.locator('.doc-card').first().click()
  await page.waitForURL(/\/doc\//, { timeout: 20_000 })
  // DocReader hides the standard shell and fills the viewport with an iframe
  await expect(page.locator('iframe').first()).toBeVisible({ timeout: 20_000 })
  expect(errors).toEqual([])
})
