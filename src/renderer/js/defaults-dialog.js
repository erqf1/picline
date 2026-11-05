// Fenster "Als Standard-App festlegen" (gleiche Datei in Textline und Picline).
// Zeigt je Dateigruppe, welches Programm sie gerade öffnet; vorausgewählt ist nur, was kein anderes
// W-Software-Programm schon hat. Unter Windows bleibt das Fenster offen und hakt live ab, was in den
// Windows-Einstellungen erledigt wurde.
import { h, dialog } from './ui.js';
import TYPES from '../../shared/default-types.js';
import STR from '../../shared/default-strings.js';

export function openDefaultsDialog(api, lang) {
  const T = (k, v) => STR.t(lang, k, v);
  const app = TYPES.name;
  const label = (g) => (g.label[lang] || g.label.en);
  const extHint = (g) => g.exts.slice(0, 6).map((e) => `.${e}`).join(' ') + (g.exts.length > 6 ? ' …' : '');
  const checks = {};
  let state = null;
  let timer = null;
  const list = h('div', { class: 'defaults-list' }, h('p', { class: 'defaults-loading', text: T('loading') }));
  const note = h('p', { class: 'defaults-note' });
  const applyBtn = h('button', { class: 'btn primary', disabled: true }, T(api.platform === 'win32' ? 'openSettings' : 'apply'));
  const closeBtn = h('button', { class: 'btn' }, T('cancel'));

  const statusText = (g) => {
    if (g.mine) return T('mine', { app });
    if (g.total > 1 && g.done) return T('part', { n: g.done, m: g.total });
    return g.current ? T('now', { app: g.current }) : T('nobody');
  };
  function render() {
    list.replaceChildren(...TYPES.groups.map((g) => {
      const s = state.groups.find((x) => x.id === g.id) || { mine: false };
      if (checks[g.id] === undefined) checks[g.id] = !s.mine && g.primary && !(s.owner && s.owner !== app);
      const box = h('input', { type: 'checkbox', checked: s.mine || checks[g.id] ? 'checked' : null, disabled: s.mine ? 'disabled' : null,
        onchange: (e) => { checks[g.id] = e.target.checked; updateButton(); } });
      return h('label', { class: `defaults-row${s.mine ? ' mine' : ''}` }, box,
        h('span', { class: 'defaults-name' }, h('b', { text: label(g) }), h('small', { text: extHint(g) })),
        h('span', { class: `defaults-now${s.owner && s.owner !== app ? ' owned' : ''}`, text: statusText(s) }));
    }));
    updateButton();
  }
  function updateButton() {
    const any = state && TYPES.groups.some((g) => checks[g.id] && !(state.groups.find((x) => x.id === g.id) || {}).mine);
    applyBtn.disabled = !any;
  }
  async function refresh() {
    state = await api.state();
    render();
  }

  applyBtn.onclick = async () => {
    const ids = TYPES.groups.filter((g) => checks[g.id] && !(state.groups.find((x) => x.id === g.id) || {}).mine).map((g) => g.id);
    if (!ids.length) return;
    applyBtn.disabled = true;
    if (api.platform === 'win32' && state.registered === '') {
      note.textContent = T('notRegistered', { app });
      note.className = 'defaults-note warn';
    }
    const r = await api.apply(ids);
    if (!r.ok) {
      note.textContent = `${T('failed', { e: r.error || '?' })} ${api.platform === 'darwin' ? T('macHand', { app }) : ''}`;
      note.className = 'defaults-note warn';
    } else if (r.settings) {
      // Windows: ab jetzt alle paar Sekunden nachsehen, was schon umgestellt ist
      closeBtn.textContent = T('close');
      clearInterval(timer);
      timer = setInterval(() => {
        if (!list.isConnected) return clearInterval(timer);
        refresh();
      }, 2500);
    } else {
      await refresh();
      const n = state.groups.filter((g) => g.mine).length;
      note.textContent = T('done', { app, n });
      note.className = 'defaults-note ok';
      closeBtn.textContent = T('close');
    }
    updateButton();
  };

  const body = h('div', { class: 'defaults' },
    h('p', { class: 'defaults-intro', text: T('intro', { app }) }),
    api.platform === 'win32' ? h('p', { class: 'defaults-how', text: T('winHow', { app }) }) : null,
    list, note,
    h('div', { class: 'defaults-buttons' }, closeBtn, applyBtn));
  dialog({
    title: T('title'),
    body,
    buttons: [],
    wide: true,
    className: 'defaults-dialog',
    onOpen: (card, close) => {
      closeBtn.onclick = () => {
        clearInterval(timer);
        close(null);
      };
      refresh();
    },
  }).then(() => clearInterval(timer));
}
