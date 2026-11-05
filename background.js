// Reads the latest unread emails from the Gmail account signed in to this browser (Atom feed, read-only)
// and returns the most recent verification code received in the last few minutes.
// Codes from emails already opened in Gmail (sent by gmail.js) are kept in session storage for 15 minutes.
const FEED = 'https://mail.google.com/mail/u/0/feed/atom';
const MAX_AGE = 15 * 60 * 1000;

const TOPIC = /(verification code|code de v[ée]rification|confirmation code|code de confirmation|security code|code de s[ée]curit[ée]|login code|code de connexion|sign[- ]in code|one[- ]time|\bOTP\b|passcode|verify your|v[ée]rifiez votre|your code|votre code|\bcode\b)/i;
const CODE = '([0-9]{4,8}|[A-Z0-9]{3}-[A-Z0-9]{3}|(?=[A-Z0-9]*[0-9])(?=[A-Z0-9]*[A-Z])[A-Z0-9]{6})';
const NEAR = [
  new RegExp('(?:\\bcode|\\bOTP|passcode|\\bPIN)\\b[^0-9A-Za-z]{0,3}(?:\\w+[^0-9A-Za-z]{1,3}){0,6}?\\b' + CODE + '\\b', 'gi'),
  new RegExp('\\b' + CODE + '\\b\\s+(?:is your|est votre|est ton|ist Ihr)\\b', 'gi'),
];

const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n)).replace(/&amp;/g, '&');
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ''; };

function findCode(subject, body) {
  if (!TOPIC.test(subject) && !TOPIC.test(body.slice(0, 400))) return null;
  for (const txt of [subject, body]) {
    for (const rx of NEAR) {
      rx.lastIndex = 0;
      for (const m of txt.matchAll(rx)) {
        const c = m[1];
        if (/^\d+$/.test(c) && (/^(19|20)\d\d$/.test(c) || new Set(c).size === 1)) continue; // year or 000000
        if (!/\d/.test(c) || c !== c.toUpperCase()) continue;
        return c;
      }
    }
  }
  return null;
}

async function fromFeed() {
  const res = await fetch(FEED, { credentials: 'include', cache: 'no-store' });
  if (!res.ok) return {};
  const xml = await res.text();
  for (const entry of xml.split('<entry>').slice(1)) {
    const issued = Date.parse(tag(entry, 'modified') || tag(entry, 'issued'));
    if (!(Date.now() - issued < MAX_AGE)) continue;
    const code = findCode(tag(entry, 'title'), tag(entry, 'summary'));
    if (code) return { code, from: tag(entry, 'name'), issued };
  }
  return {};
}

async function fromOpened() {
  const { opened } = await chrome.storage.session.get('opened');
  return opened && Date.now() - opened.issued < MAX_AGE ? opened : {};
}

async function latestCode() {
  const [feed, opened] = await Promise.all([fromFeed().catch(() => ({})), fromOpened()]);
  return (feed.issued || 0) >= (opened.issued || 0) ? feed : opened;
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'seen') {
    const code = findCode(msg.subject, msg.body.replace(/\s+/g, ' '));
    if (code) chrome.storage.session.set({ opened: { code, from: msg.from, issued: Date.now() - msg.age * 60000 } });
    return;
  }
  if (msg !== 'latest-code') return;
  latestCode().then(reply, (e) => reply({ error: String(e) }));
  return true;
});
