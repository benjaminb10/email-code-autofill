// When a verification-code field gets focus, asks the background for the latest code received in Gmail
// and shows it in a small chip below the field, with a soft chime. Click the chip (or press Tab while it shows) to fill it.
(() => {
  const HINT = /(one.?time|otp|passcode|verif|v[ée]rif|confirm|security.?code|auth.?code|\bcode\b|2fa|mfa|\btoken\b|\bpin\b)/i;
  const POLL_MS = 3000, POLL_FOR_MS = 3 * 60 * 1000;
  let chip, timer, used = new Set(), chimed = new Set();

  const labelOf = (el) => {
    const parts = [el.name, el.id, el.placeholder, el.getAttribute('aria-label'), el.autocomplete, el.className];
    if (el.labels) for (const l of el.labels) parts.push(l.textContent);
    return parts.join(' ');
  };
  const isTextInput = (el) => el instanceof HTMLInputElement && /^(text|tel|number|password|)$/i.test(el.type) && !el.disabled && !el.readOnly;

  // A group of 4 to 8 one-character inputs next to each other (split code boxes).
  function splitGroup(el) {
    if (!(el.maxLength === 1)) return null;
    let box = el.parentElement;
    for (let i = 0; i < 4 && box; i++, box = box.parentElement) {
      const inputs = [...box.querySelectorAll('input')].filter((x) => isTextInput(x) && x.maxLength === 1);
      if (inputs.length >= 4 && inputs.length <= 8) return inputs;
    }
    return null;
  }

  function isCodeField(el) {
    if (!isTextInput(el)) return false;
    if (el.autocomplete === 'one-time-code' || splitGroup(el)) return true;
    if (el.type === 'password' || /e-?mail|phone|t[ée]l[ée]phone|search|zip|postal|card|cvc|cvv/i.test(labelOf(el))) return false;
    return HINT.test(labelOf(el));
  }

  const setValue = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  function fill(el, code) {
    const group = splitGroup(el);
    const digits = code.replace(/-/g, '');
    if (group && group.length === digits.length) {
      group.forEach((input, i) => { input.focus(); setValue(input, digits[i]); });
    } else {
      el.focus();
      setValue(el, el.maxLength > 0 && el.maxLength < code.length ? digits : code);
    }
    used.add(code);
    hide();
  }

  function hide() { chip?.remove(); chip = null; }

  // Soft two-note chime when a code shows up (synthesized, no audio file).
  function chime() {
    try {
      const ctx = new AudioContext();
      [[1318.5, 0], [1760, 0.09]].forEach(([freq, at]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + at;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.4);
      });
      setTimeout(() => ctx.close(), 800);
    } catch {}
  }

  function show(el, code, from) {
    hide();
    const r = el.getBoundingClientRect();
    chip = document.createElement('div');
    const root = chip.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      button{all:initial;display:flex;align-items:center;gap:8px;cursor:pointer;background:#fff;color:#1f1f1f;
        font:14px -apple-system,BlinkMacSystemFont,sans-serif;padding:8px 12px;border-radius:10px;
        box-shadow:0 4px 16px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.08)}
      button:hover{background:#f2f6fc} b{font-weight:600;letter-spacing:1px} small{color:#666}
      @media (prefers-color-scheme:dark){button{background:#2b2b2b;color:#eee}button:hover{background:#353535}small{color:#aaa}}
    </style><button title="Fill this code"><span>Code from Gmail</span><b></b><small></small></button>`;
    root.querySelector('b').textContent = code;
    root.querySelector('small').textContent = from ? `· ${from}` : '';
    root.querySelector('button').addEventListener('mousedown', (e) => { e.preventDefault(); fill(el, code); });
    Object.assign(chip.style, { position: 'fixed', zIndex: 2147483647, left: `${Math.max(8, r.left)}px`,
      top: `${Math.min(innerHeight - 50, r.bottom + 6)}px` });
    document.documentElement.appendChild(chip);
    if (!chimed.has(code)) { chimed.add(code); chime(); }
    el.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Tab' && chip) { e.preventDefault(); fill(el, code); }
      el.removeEventListener('keydown', onKey);
    });
  }

  function watch(el) {
    clearInterval(timer);
    const start = Date.now();
    const ask = () => {
      if (document.activeElement !== el || Date.now() - start > POLL_FOR_MS) { clearInterval(timer); return; }
      if (chip) return;
      if (!chrome.runtime?.id) { clearInterval(timer); return; } // extension reloaded: this old copy stops
      try {
        chrome.runtime.sendMessage('latest-code', (res) => {
          if (chrome.runtime.lastError || !res?.code || used.has(res.code)) return;
          if (document.activeElement === el && el.value.replace(/\s/g, '') !== res.code) show(el, res.code, res.from);
        });
      } catch { clearInterval(timer); }
    };
    ask();
    timer = setInterval(ask, POLL_MS);
  }

  document.addEventListener('focusin', (e) => { if (isCodeField(e.target)) watch(e.target); }, true);
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!isCodeField(document.activeElement)) { hide(); clearInterval(timer); }
  }, 150), true);
  addEventListener('scroll', hide, true);
})();
