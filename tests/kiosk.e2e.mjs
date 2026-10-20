// Kiosk V2 end-to-end checks against a local `KIOSK_MOCK=1 next start` server.
// Run: BASE=http://localhost:3100 SHOTS=/tmp/shots node tests/kiosk.e2e.mjs   (needs `playwright`)
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:3100';
const SHOTS = process.env.SHOTS || './shots';
const results = [];
const check = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); };
const api = async (page, body) => page.evaluate(async ([b, u]) => (await fetch(u + '/api/checkin', { method: b ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined })).json(), [body, BASE]);

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const [label, vp] of [['portrait', { width: 820, height: 1180 }], ['landscape', { width: 1180, height: 820 }]]) {
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const shot = (n) => page.screenshot({ path: `${SHOTS}/${label}-${n}.png` });
  await page.goto(BASE + '/checkin');
  await api(page, { action: 'mockReset' });
  await page.reload(); await page.waitForSelector('[data-testid=kiosk-clock]');

  // Home: exactly 3 actions per language, both languages visible, no substitute card
  check(`${label}: 3 EN + 3 ES home buttons`, (await page.locator('.k-en .k-btn').count()) === 3 && (await page.locator('.k-es .k-btn').count()) === 3);
  check(`${label}: no substitute card on kiosk`, (await page.locator('.ci-substitute-card, .ci-substitute-section').count()) === 0);
  const minH = await page.$$eval('.k-btn', (els) => Math.min(...els.map((e) => e.getBoundingClientRect().height)));
  check(`${label}: home touch targets >= 88px (min ${Math.round(minH)})`, minH >= 88);
  const enBox = await page.locator('.k-en').boundingBox(), esBox = await page.locator('.k-es').boundingBox();
  check(`${label}: layout ${label === 'landscape' ? 'side-by-side' : 'stacked'}`, label === 'landscape' ? esBox.x > enBox.x + 100 : esBox.y > enBox.y + 100);
  await page.waitForFunction(() => /\d/.test(document.querySelector('[data-testid=kiosk-clock]').innerText));
  const homeText = await page.evaluate(() => document.body.innerText);
  check(`${label}: one shared "St. Henry" title above both sections`, (homeText.match(/St\. Henry/g) || []).length === 1 && (await page.locator('.k-header').boundingBox()).y < enBox.y);
  check(`${label}: no per-language chapel names`, !/Adoration Chapel|Capilla de Adoración San Enrique/.test(homeText));
  const clockTxt = await page.locator('[data-testid=kiosk-clock]').innerText();
  const nyNow = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date());
  check(`${label}: big shared clock in parish time (${clockTxt})`, /^\d{1,2}:\d{2} (AM|PM)$/.test(clockTxt) && clockTxt === nyNow);
  const clockPx = await page.locator('[data-testid=kiosk-clock]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  check(`${label}: clock font >= 56px (${clockPx})`, clockPx >= 56);
  check(`${label}: no attendance count on kiosk home`, !/checked in|registrad/i.test(homeText));
  const helpEn = await page.locator('[data-testid=help-en]').innerText(), helpEs = await page.locator('[data-testid=help-es]').innerText();
  check(`${label}: EN help line + phone inside EN section`, helpEn.startsWith('Problem or need a substitute? Call the parish office') && helpEn.includes('(954) 785-2450') && (await page.locator('.k-en [data-testid=help-en]').count()) === 1);
  check(`${label}: ES help line + phone inside ES section`, helpEs.startsWith('¿Algún problema o necesita un sustituto? Llame a la oficina parroquial') && helpEs.includes('(954) 785-2450') && (await page.locator('.k-es [data-testid=help-es]').count()) === 1);
  const helpPx = await page.locator('[data-testid=help-en]').evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  check(`${label}: help line readable (>= 18px, ${helpPx})`, helpPx >= 18);
  const vh = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight]);
  check(`${label}: home fits without scrolling`, vh[0] <= vh[1]);
  await shot('01-home');

  // EN check-in, duplicate names disambiguated
  await page.click('[data-testid=home-checkin-en]');
  await page.fill('[data-testid=search]', 'mar');
  await page.waitForSelector('[data-testid=name-option]');
  const opts = await page.locator('[data-testid=name-option]').allInnerTexts();
  check(`${label}: duplicate "Maria L." shown with distinguishing hints`, opts.filter((o) => o.startsWith('Maria L')).length === 3 && new Set(opts).size === opts.length);
  const html = await page.content();
  check(`${label}: no volunteer phone numbers in kiosk DOM`, !/954555\d{4}|555-01\d\d/.test(html) && !(await page.evaluate(() => document.body.innerText)).replace('(954) 785-2450', '').match(/\d{3}\D?\d{3}\D?\d{4}/));
  await shot('02-en-search-duplicates');
  await page.locator('[data-testid=name-option]').first().click();
  await page.waitForSelector('[data-testid=done-screen]');
  check(`${label}: EN confirmation "You're checked in!"`, (await page.locator('.k-title').innerText()).includes("You're checked in!"));
  await shot('03-en-checked-in');
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // Same person again -> fresh check-in (renewal), still only one active record
  await page.click('[data-testid=home-checkin-en]');
  await page.fill('[data-testid=search]', 'mar');
  await page.locator('[data-testid=name-option]').first().click();
  await page.waitForSelector('[data-testid=done-screen]');
  check(`${label}: repeat check-in creates a fresh check-in`, (await page.locator('.k-title').innerText()).includes("You're checked in!"));
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // ES: unscheduled manual entry + overlapping check-ins
  await page.click('[data-testid=home-checkin-es]');
  check(`${label}: ES flow is Spanish only`, (await page.locator('.k-title').innerText()) === 'Toque su nombre' && (await page.locator('[data-testid=nav-home]').innerText()).includes('Inicio'));
  await page.click('[data-testid=not-listed]');
  await page.fill('[data-testid=manual-name]', 'Lucía Fernández');
  await shot('04-es-manual-entry');
  await page.click('[data-testid=manual-submit]');
  await page.waitForSelector('[data-testid=done-screen]');
  check(`${label}: ES confirmation "¡Su entrada ha sido registrada!"`, (await page.locator('.k-title').innerText()).includes('¡Su entrada ha sido registrada!'));
  await shot('05-es-checked-in');
  await page.getByRole('button', { name: 'Listo', exact: true }).click();

  // Second "Maria L." (different person) also checks in -> overlap of 3
  await page.click('[data-testid=home-checkin-en]');
  await page.fill('[data-testid=search]', 'maria lima');
  await page.locator('[data-testid=name-option]').first().click();
  await page.waitForSelector('[data-testid=done-screen]');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  let st = await api(page);
  check(`${label}: 3 overlapping active check-ins`, st.active.length === 3);
  check(`${label}: kiosk API returns no phone/email fields`, !JSON.stringify(st).match(/phone|email|954555/));

  // Refresh persistence
  await page.reload(); await page.waitForSelector('[data-testid=kiosk-clock]');
  check(`${label}: after refresh server still has 3 checked in`, (await api(page)).active.length === 3);
  await shot('06-home-after-refresh');

  // ES checkout of one person only
  await page.click('[data-testid=home-checkout-es]');
  await page.waitForSelector('[data-testid=active-option]');
  check(`${label}: ES checkout title`, (await page.locator('.k-title').innerText()) === '¿Quién se retira?');
  await shot('07-es-who-is-leaving');
  await page.locator('[data-testid=active-option]', { hasText: 'Lucía' }).click();
  await page.click('[data-testid=confirm-checkout]');
  await page.waitForSelector('[data-testid=done-screen]');
  st = await api(page);
  check(`${label}: one checkout leaves the other 2 active`, st.active.length === 2 && !st.active.some((a) => a.displayName.startsWith('Lucía')));
  await page.getByRole('button', { name: 'Listo', exact: true }).click();

  // Network failure during check-out: must not show success
  await page.click('[data-testid=home-checkout-en]');
  await page.waitForSelector('[data-testid=active-option]');
  await page.locator('[data-testid=active-option]').first().click();
  await page.route('**/api/checkin', (r) => r.request().method() === 'POST' ? r.abort('internetdisconnected') : r.continue());
  await page.click('[data-testid=confirm-checkout]');
  await page.waitForSelector('[data-testid=error-screen]');
  check(`${label}: network failure shows error, no false success`, (await page.locator('[data-testid=done-screen]').count()) === 0 && (await page.locator('[data-testid=error-screen]').innerText()).includes('Nothing was saved'));
  await shot('08-en-network-error');
  await page.unroute('**/api/checkin');
  st = await api(page);
  check(`${label}: failed checkout did not change data`, st.active.length === 2);
  await page.getByRole('button', { name: 'Try Again' }).click();
  await page.waitForSelector('[data-testid=active-option]');
  await page.click('[data-testid=nav-home]');

  // New here (EN) with validation, double-submit guard, then check in immediately
  await page.click('[data-testid=home-new-en]');
  await page.fill('[data-testid=inq-name]', 'Peter Novak');
  await page.fill('[data-testid=inq-phone]', '555-12');
  await page.click('[data-testid=inq-submit]');
  check(`${label}: phone validation message`, (await page.locator('[data-testid=form-error]').count()) === 1);
  await page.fill('[data-testid=inq-phone]', '(954) 555-0199');
  await page.check('[data-testid=inq-consent]');
  await shot('09-en-new-here-form');
  await page.locator('[data-testid=inq-submit]').dblclick();
  await page.waitForSelector('[data-testid=inq-thanks]');
  await shot('10-en-new-here-thanks');
  await page.click('[data-testid=inq-checkin]');
  await page.waitForSelector('[data-testid=done-screen]');
  st = await api(page);
  check(`${label}: inquiry person checked in immediately`, st.active.some((a) => a.displayName === 'Peter N.'));
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  // ES new-here form screenshot + simulated on-screen keyboard (reduced viewport height)
  await page.click('[data-testid=home-new-es]');
  check(`${label}: ES welcome title`, (await page.locator('.k-title').innerText()) === '¡Bienvenido(a)!');
  await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * (label === 'portrait' ? 0.72 : 0.55)) });
  await page.click('[data-testid=inq-name]');
  const submitVisible = await page.locator('[data-testid=inq-submit]').isVisible();
  check(`${label}: form usable with keyboard-sized viewport (submit reachable)`, submitVisible);
  await shot('11-es-new-here-keyboard');
  await page.setViewportSize(vp);
  await page.click('[data-testid=nav-home]');

  // Admin: inquiries, active list, audit
  await page.goto(BASE + '/admin');
  await page.fill('#pw', 'testpw'); await page.click('text=Sign In');
  await page.waitForSelector('[data-testid=kiosk-admin]');
  const adm = await page.locator('[data-testid=kiosk-admin]').innerText();
  check(`${label}: admin shows inquiry with consent`, adm.includes('Peter Novak') && adm.includes('Consented to contact'));
  check(`${label}: admin shows checked-in list`, adm.includes('Checked in now') && adm.includes('Maria Lopez'));
  await page.screenshot({ path: `${SHOTS}/${label}-12-admin.png`, fullPage: true });
  await ctx.close();
}

// Last person leaves -> admin shows unconfirmed coverage; long check-in flag
{
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/checkin');
  await api(page, { action: 'mockReset' });
  const d = (await api(page, null), await page.evaluate(async (u) => (await fetch(u + '/api/checkin?directory=1')).json(), BASE)).directory;
  const r = await api(page, { action: 'checkin', key: d[0].key });
  await api(page, { action: 'checkout', id: r.id });
  await page.goto(BASE + '/admin'); await page.fill('#pw', 'testpw'); await page.click('text=Sign In');
  await page.waitForSelector('[data-testid=coverage-status]');
  check('admin: nobody checked in -> unconfirmed coverage status', (await page.locator('[data-testid=coverage-status]').innerText()).includes('Unattended / unconfirmed coverage'));
  await page.screenshot({ path: `${SHOTS}/admin-unconfirmed-coverage.png`, fullPage: true });
  // Forgotten checkout: correction with audit trail (set arrival 5h ago, still active)
  const r2 = await api(page, { action: 'checkin', manualName: 'Long Stay Test' });
  await page.evaluate(async ([id]) => fetch('/api/admin', { method: 'PATCH', headers: { 'x-admin-password': 'testpw', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'correction', id, note: 'test backdate', checked_in_at: new Date(Date.now() - 5 * 36e5).toISOString() }) }), [r2.id]);
  await page.reload(); await page.waitForSelector('[data-testid=kiosk-admin]');
  // With the 1-hour shift (SHIFT_MINUTES, default 60) a 5h-old check-in has expired: shown checked out "(auto)", not active.
  if (Number(process.env.SHIFT_MINUTES || 60) > 300) check('admin: >4h active check-in flagged', (await page.locator('[data-testid=long-flag]').count()) === 1);
  else check('admin: 5h-old check-in auto-expired (not active, shown as auto check-out)', (await page.locator('[data-testid=long-flag]').count()) === 0 && (await page.locator('[data-testid=kiosk-admin]').innerText()).includes('(auto)'));
  await page.locator('details summary').click();
  check('admin: correction recorded in audit trail', (await page.locator('[data-testid=kiosk-admin]').innerText()).includes('correction'));
  await page.screenshot({ path: `${SHOTS}/admin-long-checkin-flag-audit.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
for (const [s, n] of results) console.log(s, n);
const fails = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
