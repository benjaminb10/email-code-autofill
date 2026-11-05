// On Gmail: when you open a recent email (Gmail shows "il y a N minutes" / "N minutes ago"),
// sends its text to the background, which keeps any verification code for 15 minutes.
// That way the code is still suggested after the email has been read.
(() => {
  const sent = new WeakSet();
  const minutesAgo = (txt) => {
    const m = txt.match(/il y a (\d+) min|(\d+) min(?:ute)?s? ago/i);
    return m ? Number(m[1] ?? m[2]) : null;
  };

  function scan() {
    const subject = document.querySelector('h2.hP')?.textContent || '';
    for (const body of document.querySelectorAll('.a3s')) {
      if (sent.has(body)) continue;
      const msg = body.closest('.adn') || body.closest('[data-message-id]');
      const age = minutesAgo(msg?.querySelector('.g3')?.textContent || '');
      if (age === null || age > 15) continue;
      sent.add(body);
      const from = msg?.querySelector('.gD')?.getAttribute('name') || '';
      try {
        chrome.runtime.sendMessage({ type: 'seen', subject, body: body.innerText.slice(0, 3000), from, age }).catch(() => {});
      } catch {
        observer.disconnect(); // extension reloaded: this old copy stops
        return;
      }
    }
  }

  const observer = new MutationObserver(() => {
    if (!chrome.runtime?.id) return observer.disconnect();
    clearTimeout(scan.t);
    scan.t = setTimeout(scan, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
