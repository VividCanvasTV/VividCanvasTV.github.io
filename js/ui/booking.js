// The signature moment, made real: every contact action opens the booking
// form in a dark modal. Built lazily — the iframe and its embed script cost
// nothing until the visitor reaches for the pen. Links keep their mailto
// hrefs as the no-JS fallback.

const FORM_ID = 'EH6YUur4y93VCDtT4u1S';
const FORM_URL = `https://io.vividcanvas.info/widget/form/${FORM_ID}`;

let overlay = null;
let lastFocus = null;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function build() {
  const iframe = el('iframe', {
    src: FORM_URL,
    style: 'width:100%;height:100%;border:none;border-radius:3px',
    id: `inline-${FORM_ID}`,
    'data-layout': "{'id':'INLINE'}",
    'data-trigger-type': 'alwaysShow',
    'data-trigger-value': '',
    'data-activation-type': 'alwaysActivated',
    'data-activation-value': '',
    'data-deactivation-type': 'neverDeactivate',
    'data-deactivation-value': '',
    'data-form-name': 'New Client For Vivid',
    'data-height': '850',
    'data-layout-iframe-id': `inline-${FORM_ID}`,
    'data-form-id': FORM_ID,
    title: 'New Client For Vivid',
  });

  overlay = el('div', { id: 'bookform', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Book with VividCanvas' },
    el('div', { class: 'bf-scrim', 'data-close': '' }),
    el('div', { class: 'bf-panel' },
      el('div', { class: 'bf-bar' },
        el('span', { class: 'bf-title', text: 'SIGN YOUR WORLD' }),
        el('button', { class: 'bf-close', type: 'button', 'aria-label': 'Close booking form', 'data-close': '', text: '×' }),
      ),
      el('div', { class: 'bf-frame' }, iframe),
      el('a', { class: 'bf-mail', href: 'mailto:hello@vividcanvas.tv', text: 'prefer email? hello@vividcanvas.tv' }),
    ),
  );
  document.body.appendChild(overlay);
  // NOTE: the vendor form_embed.js is intentionally NOT loaded — it exists to
  // auto-size inline embeds and hides the iframe until a handshake. Our panel
  // has a definite height and the form scrolls within it; a plain iframe is
  // simpler and cannot be left invisible by a missed postMessage.

  overlay.addEventListener('click', e => {
    if (e.target.closest('[data-close]')) close();
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) close();
  });
}

export function open() {
  if (!overlay) build();
  lastFocus = document.activeElement;
  overlay.classList.add('open');
  document.documentElement.classList.add('bf-lock');
  overlay.querySelector('.bf-close').focus();
}

function close() {
  overlay.classList.remove('open');
  document.documentElement.classList.remove('bf-lock');
  lastFocus?.focus?.();
}

// wire every contact action on the page; hrefs stay as mailto for no-JS
export function initBooking() {
  for (const sel of ['#contactlink', '#copy .cta', '.ed-cta a']) {
    document.querySelectorAll(sel).forEach(a => {
      a.addEventListener('click', e => {
        e.preventDefault();
        open();
      });
    });
  }
}
