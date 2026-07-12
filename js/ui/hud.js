// The only fixed UI: wordmark, sound, contact, act rail, scroll hint.
// Mystery lives in the story — never in the navigation.

import { ACT_STARTS } from '../story/timeline.js';

export class HUD {
  constructor(scroll, score) {
    this.scroll = scroll;
    this.score = score;
    this.beats = {};
    document.querySelectorAll('#copy .beat').forEach(el => {
      this.beats[el.dataset.beat] = el;
    });
    this.rail = [...document.querySelectorAll('#rail button')];
    this.hint = document.getElementById('hint');
    this.cta = document.querySelector('#copy .cta');
    this.cta?.setAttribute('tabindex', '-1'); // aria-hidden layer; real link lives in #story
    // GL mode clips #story to 1px; keep its links out of the tab order so
    // keyboard users never land on an invisible focus stop
    document.querySelectorAll('#story a').forEach(a => { a.tabIndex = -1; });
    this._act = -1;

    this.rail.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        scroll.scrollToProgress(ACT_STARTS[i] + (i === 0 ? 0 : 0.012));
      });
    });
    document.getElementById('wordmark').addEventListener('click', e => {
      e.preventDefault();
      scroll.scrollToProgress(0);
    });

    // sound: opt-in, remembered, resumed only on a real gesture
    const st = document.getElementById('soundtoggle');
    st.addEventListener('click', async () => {
      const on = st.getAttribute('aria-pressed') !== 'true';
      st.setAttribute('aria-pressed', String(on));
      try { localStorage.setItem('vc-sound', on ? '1' : '0'); } catch {}
      if (on) await score.enable(); else score.disable();
    });
    let wanted = false;
    try { wanted = localStorage.getItem('vc-sound') === '1'; } catch {}
    if (wanted) {
      const arm = async () => {
        st.setAttribute('aria-pressed', 'true');
        await score.enable();
      };
      addEventListener('pointerdown', arm, { once: true });
    }
  }

  update(p) {
    let act = 0;
    for (let i = 0; i < ACT_STARTS.length; i++) if (p >= ACT_STARTS[i] - 0.004) act = i;
    if (act !== this._act) {
      this._act = act;
      this.rail.forEach((b, i) => b.classList.toggle('live', i === act));
    }
    this.hint.classList.toggle('gone', p > 0.02);
    this.cta?.classList.toggle('signed', p > 0.968);
  }
}
