import {expect, test} from '@playwright/test'

test('creates, edits, autolinks, and unlinks in a real browser', async ({page}) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', {name: 'Hyperlinks that feel finished.'}),
  ).toBeVisible()

  const editor = page.locator('.ProseMirror')
  await expect(editor).toBeVisible()

  const firstParagraph = editor.locator('p').first()
  await firstParagraph.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Control+k')

  const createDialog = page.getByRole('dialog', {name: 'Add link'})
  await expect(createDialog).toBeVisible()
  await createDialog.getByLabel('Text').fill('Example')
  await createDialog.getByLabel('URL').fill('example.com')
  await createDialog.getByRole('button', {name: 'Apply'}).click()

  const createdLink = editor.getByRole('link', {name: 'Example'})
  await expect(createdLink).toHaveAttribute('href', 'https://example.com')

  await createdLink.click()
  const preview = page.getByRole('toolbar', {name: 'Link details'})
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('https://example.com')
  await preview.getByRole('button', {name: 'Edit link'}).click()

  const editDialog = page.getByRole('dialog', {name: 'Edit link'})
  await expect(editDialog).toBeVisible()
  await editDialog.getByLabel('URL').fill('example.org')
  await editDialog.getByRole('button', {name: 'Apply'}).click()
  await expect(createdLink).toHaveAttribute('href', 'https://example.org')

  const secondParagraph = editor.locator('p').nth(1)
  await secondParagraph.click()
  await page.keyboard.press('End')
  await page.keyboard.type(' browser.com ')
  await expect(editor.getByRole('link', {name: 'browser.com'})).toHaveAttribute(
    'href',
    'https://browser.com',
  )

  await createdLink.click()
  await page
    .getByRole('toolbar', {name: 'Link details'})
    .getByRole('button', {name: 'Remove link'})
    .click()
  await expect(editor.getByRole('link', {name: 'Example'})).toHaveCount(0)
  await expect(editor).toContainText('Example')

  const shell = page.locator('main')
  await page.getByRole('button', {name: 'Dark'}).click()
  await expect(shell).toHaveClass(/theme-dark/)
  await page.getByRole('button', {name: 'RTL'}).click()
  await expect(shell).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('button', {name: 'إضافة رابط'})).toBeVisible()
})
