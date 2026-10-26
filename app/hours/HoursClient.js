'use client';
import { useEffect, useMemo, useState } from 'react';
import { OPEN_HOURS, WEEK_LABEL, slotKey } from '../../lib/openHours';

const T = {
  en: {
    toggle: 'Español', kicker: 'Holy Family Adoration Chapel · St. Henry',
    title: 'Would you spend an hour with The Blessed Sacrament this week?',
    intro: 'These hours had almost no one in the chapel last week. Tap the ones you can take.',
    covered: 'Every hour this week is covered, thank you! 🙏', coveredSub: 'Want to hear when an hour needs someone? Join the list.',
    join: 'Join the list', joined: 'You are on the list. Thank you!',
    justTaken: (h) => `Someone just took ${h}. Please pick another hour below.`, savedSome: (h) => `We saved ${h}.`,
    picked: (n) => `${n} hour${n === 1 ? '' : 's'} picked`, next: 'Continue',
    formTitle: 'Almost done', name: 'First name', contact: 'Phone or email',
    alerts: 'Text or email me when an hour needs someone', regular: "I'd like a regular weekly hour",
    submit: 'Sign me up', back: 'Back', saving: 'Saving…',
    thanks: (n) => `Thank you, ${n}!`, yours: 'Your hours:',
    steps: ['Come to the chapel a few minutes early.', 'Tap “Check in” on the iPad by the door.', 'Type your first name.', 'Stay the hour with The Blessed Sacrament.'],
    cal: 'Add to my calendar', more: 'Pick more hours', calTitle: 'An hour with The Blessed Sacrament – Holy Family Chapel, St. Henry',
  },
  es: {
    toggle: 'English', kicker: 'Capilla de Adoración Sagrada Familia · St. Henry',
    title: '¿Pasarías una hora con El Santísimo esta semana?',
    intro: 'Estas horas casi no tuvieron a nadie en la capilla la semana pasada. Toca las que puedas tomar.',
    covered: '¡Todas las horas de esta semana están cubiertas, gracias! 🙏', coveredSub: '¿Quieres saber cuando una hora necesite a alguien? Únete a la lista.',
    join: 'Unirme a la lista', joined: 'Ya estás en la lista. ¡Gracias!',
    justTaken: (h) => `Alguien acaba de tomar ${h}. Elige otra hora abajo.`, savedSome: (h) => `Guardamos ${h}.`,
    picked: (n) => `${n} hora${n === 1 ? '' : 's'} elegida${n === 1 ? '' : 's'}`, next: 'Continuar',
    formTitle: 'Casi listo', name: 'Nombre', contact: 'Teléfono o correo',
    alerts: 'Avísenme por mensaje o correo cuando una hora necesite a alguien', regular: 'Me gustaría una hora fija cada semana',
    submit: 'Inscribirme', back: 'Atrás', saving: 'Guardando…',
    thanks: (n) => `¡Gracias, ${n}!`, yours: 'Tus horas:',
    steps: ['Llega a la capilla unos minutos antes.', 'Toca “Check in” en el iPad junto a la puerta.', 'Escribe tu nombre.', 'Quédate la hora con El Santísimo.'],
    cal: 'Agregar a mi calendario', more: 'Elegir más horas', calTitle: 'Una hora con El Santísimo – Capilla Sagrada Familia, St. Henry',
  },
};

const fmtHour = (h) => `${((h + 11) % 12) + 1}${h < 12 ? ' AM' : ' PM'}`;
const range = (h) => `${fmtHour(h).replace(/ (AM|PM)/, (h < 12) === (h + 1 < 12) ? '' : ' $1')}–${fmtHour(h + 1)}`;
const dayLabel = (d, lang) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
// Ends-at check in parish time (ET). Good enough client-side; server re-validates.
function etNow() { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) }; }
const hasPassed = (d, h, n) => d < n.date || (d === n.date && h + 1 <= n.hour);

function ics(keys, title) {
  const pad = (n) => String(n).padStart(2, '0');
  const ev = keys.map((k) => {
    const [d, hh] = k.split('T'); const h = Number(hh); const ds = d.replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:${k}-sthenry-adoration`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`,
      `DTSTART;TZID=America/New_York:${ds}T${pad(h)}0000`, `DTEND;TZID=America/New_York:${ds}T${pad(h + 1)}0000`,
      `SUMMARY:${title}`, 'LOCATION:Holy Family Adoration Chapel\\, St. Henry Catholic Church\\, 1500 S Andrews Ave\\, Pompano Beach\\, FL 33069',
      'DESCRIPTION:Tap Check in on the iPad by the door and type your first name.',
      'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Adoration in 1 hour', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//St Henry Adoration//EN', ...ev, 'END:VCALENDAR'].join('\r\n');
}

export default function HoursClient() {
  const [lang, setLang] = useState('en');
  const [open, setOpen] = useState(null);
  const [notice, setNotice] = useState('');
  const [sel, setSel] = useState([]);
  const [step, setStep] = useState('pick');
  const [f, setF] = useState({ first_name: '', contact: '', wants_alerts: false, wants_regular: false, website: '' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]);
  const t = T[lang];
  const now = useMemo(etNow, [step, open]);
  const openCount = (open || []).filter((k) => { const [d, h] = k.split('T'); return !hasPassed(d, Number(h), now); }).length;

  useEffect(() => {
    if (navigator.language?.startsWith('es')) setLang('es');
    try { const s = JSON.parse(localStorage.getItem('sh-volunteer') || 'null'); if (s) setF((x) => ({ ...x, first_name: s.first_name || '', contact: s.contact || '' })); } catch {}
    refresh();
    const onFocus = () => refresh();
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  function refresh() { fetch('/api/hours').then((r) => r.json()).then((d) => { const o = d.open || []; setOpen(o); setSel((x) => x.filter((k) => o.includes(k))); }).catch(() => {}); }
  const label = (k) => `${dayLabel(k.split('T')[0], lang).split(',')[0]} ${range(Number(k.split('T')[1]))}`;
  const toggle = (k) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  async function submit(e, alertsOnly = false) {
    e.preventDefault(); setNotice(''); setErr(''); setBusy(true);
    try {
      const src = new URLSearchParams(window.location.search).get('src') || 'hours-link';
      const r = await fetch('/api/hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, ...(alertsOnly ? { wants_alerts: true, alerts_only: true } : {}), language: lang, slots: alertsOnly ? [] : sel, source: src }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Error'); setBusy(false); return; }
      localStorage.setItem('sh-volunteer', JSON.stringify({ first_name: f.first_name, contact: f.contact }));
      if (alertsOnly) { setStep('joined'); setBusy(false); return; }
      const saved = d.saved || [], taken = d.taken || [];
      setSel([]); refresh();
      if (taken.length) {
        setNotice(t.justTaken(taken.map(label).join(', ')) + (saved.length ? ' ' + t.savedSome(saved.map(label).join(', ')) : ''));
        if (saved.length) setDone((x) => [...x, ...saved]);
        setStep('pick');
      } else { setDone(saved); setStep('done'); }
    } catch { setErr('Network error'); }
    setBusy(false);
  }
  function download() {
    const blob = new Blob([ics(done, t.calTitle)], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'adoration-hours.ics'; a.click();
  }

  return (
    <main className="hrs">
      <button className="hrs-lang" onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>{t.toggle}</button>
      <div className="hrs-kicker">✦ {t.kicker}</div>
      {step === 'pick' && (<>
        <h1>{t.title}</h1>
        <p className="hrs-intro">{t.intro} <b>{WEEK_LABEL[lang]}</b></p>
        {notice && <div className="hrs-err" role="status">{notice}</div>}
        {open && !openCount && (<form className="hrs-form" onSubmit={(e) => submit(e, true)}>
          <h2 style={{ fontSize: 20, marginTop: 20 }}>{t.covered}</h2><p className="hrs-intro">{t.coveredSub}</p>
          <label>{t.name}<input required autoComplete="given-name" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
          <label>{t.contact}<input required autoComplete="tel" inputMode="email" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></label>
          <input className="hrs-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden="true" />
          {err && <div className="hrs-err">{err}</div>}
          <button className="hrs-primary" disabled={busy}>{busy ? t.saving : t.join}</button>
        </form>)}
        {open && Object.entries(OPEN_HOURS).map(([d, hours]) => {
          const live = hours.filter((h) => !hasPassed(d, h, now) && open.includes(slotKey(d, h)));
          if (!live.length) return null;
          return (<section key={d} className="hrs-day"><h2>{dayLabel(d, lang)}</h2><div className="hrs-chips">
            {live.map((h) => { const k = slotKey(d, h); const on = sel.includes(k);
              return (<button key={k} className={`hrs-chip${on ? ' on' : ''}`} onClick={() => toggle(k)} aria-pressed={on}>
                <span className="hrs-time">{range(h)}</span><span className="hrs-n">{on ? '✓' : ''}</span></button>); })}
          </div></section>);
        })}
        <div className={`hrs-bar${sel.length ? ' show' : ''}`}><span>{t.picked(sel.length)}</span><button onClick={() => setStep('form')} disabled={!sel.length}>{t.next} →</button></div>
      </>)}
      {step === 'form' && (<form onSubmit={submit} className="hrs-form">
        <h1>{t.formTitle}</h1>
        <p className="hrs-intro">{sel.map((k) => `${dayLabel(k.split('T')[0], lang).split(',')[0]} ${range(Number(k.split('T')[1]))}`).join(' · ')}</p>
        <label>{t.name}<input required autoComplete="given-name" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
        <label>{t.contact}<input required autoComplete="tel" inputMode="email" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></label>
        <input className="hrs-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden="true" />
        <label className="hrs-check"><input type="checkbox" checked={f.wants_alerts} onChange={(e) => setF({ ...f, wants_alerts: e.target.checked })} />{t.alerts}</label>
        <label className="hrs-check"><input type="checkbox" checked={f.wants_regular} onChange={(e) => setF({ ...f, wants_regular: e.target.checked })} />{t.regular}</label>
        {err && <div className="hrs-err">{err}</div>}
        <button className="hrs-primary" disabled={busy}>{busy ? t.saving : t.submit}</button>
        <button type="button" className="hrs-link" onClick={() => setStep('pick')}>← {t.back}</button>
      </form>)}
      {step === 'joined' && (<div className="hrs-done"><div className="hrs-big">🕯️</div><h1>{t.joined}</h1></div>)}
      {step === 'done' && (<div className="hrs-done">
        <div className="hrs-big">🕯️</div><h1>{t.thanks(f.first_name)}</h1>
        <p className="hrs-intro">{t.yours} <b>{done.map(label).join(' · ')}</b></p>
        <ol>{t.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <button className="hrs-primary" onClick={download}>📅 {t.cal}</button>
        <button className="hrs-link" onClick={() => setStep('pick')}>{t.more}</button>
      </div>)}
    </main>
  );
}
