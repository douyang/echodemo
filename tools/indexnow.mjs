// Tells the search engines that take IndexNow (Bing, Yandex, Seznam, Naver; indexnow.org) that the
// site's addresses changed, so that they crawl them again soon. Bing also feeds Copilot and part of
// ChatGPT search. The key is public by design: the file /91b8827ebb5d06cf313f105d4392f9b4.txt on the site holds it and
// proves that the site sends the list. Google does not take IndexNow; it reads sitemap.xml.
//   node tools/indexnow.mjs          send every address in src/pages.js
//   node tools/indexnow.mjs --dry    print what it would send
// Run it after a merge that changes pages, once the site serves the change.
import { PAGES, SITE } from '../src/pages.js';

const KEY = '91b8827ebb5d06cf313f105d4392f9b4';
const host = new URL(SITE).host;
const body = { host, key: KEY, keyLocation: `${SITE}${KEY}.txt`, urlList: Object.values(PAGES).map((p) => p.url) };
if (process.argv.includes('--dry')) { console.log(JSON.stringify(body, null, 2)); process.exit(0); }
const live = await fetch(body.keyLocation);
if (!live.ok || (await live.text()).trim() !== KEY) throw new Error(`${body.keyLocation} does not serve the key yet: deploy first`);
const res = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
// 200: accepted; 202: accepted, the key still being checked
console.log(`IndexNow: HTTP ${res.status} for ${body.urlList.length} addresses`);
if (res.status !== 200 && res.status !== 202) { console.error(await res.text()); process.exit(1); }
