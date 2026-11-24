// @vitest-environment node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The hosted build's waitlist route, as mounted: a sign-up becomes a CRM Lead through rpg-ai's own web form,
 * named as rpg-ai's. The route's checks and limits are @zephyrex/marketing's, tested there; the ERP is a fake
 * here. The fake goes in before the route is imported (SOP Testing → the fake-fetch entry: Text Mutation's
 * test once reached the real ERP), and any other request fails the test.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ACCEPT = 'https://erp.zephyrex.ca/api/method/frappe.website.doctype.web_form.web_form.accept';
const erp = vi.fn<typeof fetch>(async (url) => {
  if (String(url) !== ACCEPT) throw new Error(`unexpected request to ${String(url)}`);
  return Response.json({ message: {} });
});
let POST: (request: Request) => Promise<Response>;

// The first import of the route pulls in @zephyrex/marketing and the app config: on a loaded runner that cold
// import has taken longer than the default 10 s hook timeout (build59's gate).
beforeAll(async () => {
  vi.stubGlobal('fetch', erp);
  ({ POST } = await import('./route.saas'));
}, 60_000);

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/waitlist', () => {
  it('hands the sign-up to the ERP through waitlist-rpg-ai, as a Zephyrex RPG lead', async () => {
    const answer = await POST(
      new Request('http://rpg.test/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' },
        body: JSON.stringify({ email: 'zephyrex-site-test+unit@example.com', name: 'Ada Lovelace', consent: true }),
      }),
    );
    expect(erp).toHaveBeenCalledOnce();
    expect(answer.status).toBe(202);
    const [url, init] = erp.mock.calls[0] ?? [];
    expect(String(url)).toBe(ACCEPT);
    const form = new URLSearchParams(String(init?.body));
    expect(form.get('web_form')).toBe('waitlist-rpg-ai');
    expect(JSON.parse(form.get('data') ?? '')).toMatchObject({
      doctype: 'CRM Lead',
      web_form_name: 'waitlist-rpg-ai',
      email: 'zephyrex-site-test+unit@example.com',
      enquiry: 'Zephyrex RPG waitlist: accounts',
      source: 'Website',
      status: 'New',
    });
  });
});
