import { test } from '@playwright/test'
import { launch } from '../helpers'
test('dbg', async () => {
  const { app, page } = await launch({ synthetic: true })
  app.process().stdout?.on('data', (d) => console.log('[main]', String(d)))
  app.process().stderr?.on('data', (d) => console.log('[main-err]', String(d)))
  await app.evaluate(({ ipcMain }) => {
    // eslint-disable-next-line
    const orig = (ipcMain as any)._invokeHandlers
    console.log('handlers', orig ? orig.size : 'n/a')
  })
  page.on('console', (m) => console.log('[page]', m.text()))
  await page.getByTestId('start-quick-demo').click()
  await page.getByTestId('start-recording').click()
  await page.waitForTimeout(4000)
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 500)))
  await app.close()
})
