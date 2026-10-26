'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { OPEN_HOURS, WEEK_LABEL, slotKey } from '../../lib/openHours';
import s from './hours.module.css';

const T = {
  en: {
    toggle: 'ES', toggleLabel: 'Ver en español', kicker: 'Holy Family Adoration Chapel', parish: 'St. Henry · Pompano Beach',
    title: 'Would you spend an hour with The Blessed Sacrament this week?',
    left: (n) => `${n} open hour${n === 1 ? '' : 's'} left this week`,
    intro: 'These hours were nearly empty last week. Pick one or more you can keep.',
    steps3: ['Pick hours', 'Your info', 'Done'],
    covered: 'Every hour this week is covered, thank you!', coveredSub: 'Want to hear when an hour needs someone? Join the list and we’ll reach out.',
    join: 'Join the list', joined: 'You’re on the list', joinedSub: 'Thank you. We’ll reach out when an hour needs someone.',
    justTaken: (h) => `Someone just took ${h}. Please pick another hour.`, savedSome: (h) => `We saved ${h}.`,
    selected: (n) => n ? `${n} hour${n === 1 ? '' : 's'} selected` : 'Tap an hour to begin', next: 'Continue',
    formTitle: 'Your info', formSub: 'So we can remember you and thank you.', yourPicks: 'Your hours',
    name: 'First name', contact: 'Phone or email', contactHint: 'Only the chapel coordinators see this.',
    alerts: 'Text or email me when an hour needs someone', regular: 'I’d like a regular weekly hour',
    submit: 'Sign me up', back: 'Back', saving: 'Saving…',
    thanks: (n) => `Thank you, ${n}!`, thanksSub: 'Your hours are saved.',
    expect: 'What to expect', steps: ['Come to the chapel a few minutes early.', 'Tap “Check in” on the iPad by the door.', 'Type your first name.', 'Stay the hour with The Blessed Sacrament.'],
    cal: 'Add to my calendar', more: 'Pick more hours', calTitle: 'An hour with The Blessed Sacrament – Holy Family Chapel, St. Henry',
  },
  es: {
    toggle: 'EN', toggleLabel: 'View in English', kicker: 'Capilla de Adoración Sagrada Familia', parish: 'St. Henry · Pompano Beach',
    title: '¿Pasarías una hora con El Santísimo esta semana?',
    left: (n) => `Quedan ${n} hora${n === 1 ? '' : 's'} libre${n === 1 ? '' : 's'} esta semana`,
    intro: 'Estas horas casi no tuvieron a nadie la semana pasada. Elige una o más que puedas cumplir.',
    steps3: ['Elige horas', 'Tus datos', 'Listo'],
    covered: '¡Todas las horas de esta semana están cubiertas, gracias!', coveredSub: '¿Quieres saber cuando una hora necesite a alguien? Únete a la lista.',
    join: 'Unirme a la lista', joined: 'Ya estás en la lista', joinedSub: 'Gracias. Te avisaremos cuando una hora necesite a alguien.',
    justTaken: (h) => `Alguien acaba de tomar ${h}. Elige otra hora.`, savedSome: (h) => `Guardamos ${h}.`,
    selected: (n) => n ? `${n} hora${n === 1 ? '' : 's'} elegida${n === 1 ? '' : 's'}` : 'Toca una hora para empezar', next: 'Continuar',
    formTitle: 'Tus datos', formSub: 'Para recordarte y agradecerte.', yourPicks: 'Tus horas',
    name: 'Nombre', contact: 'Teléfono o correo', contactHint: 'Solo lo ven los coordinadores de la capilla.',
    alerts: 'Avísenme cuando una hora necesite a alguien', regular: 'Me gustaría una hora fija cada semana',
    submit: 'Inscribirme', back: 'Atrás', saving: 'Guardando…',
    thanks: (n) => `¡Gracias, ${n}!`, thanksSub: 'Tus horas están guardadas.',
    expect: 'Qué esperar', steps: ['Llega a la capilla unos minutos antes.', 'Toca “Check in” en el iPad junto a la puerta.', 'Escribe tu nombre.', 'Quédate la hora con El Santísimo.'],
    cal: 'Agregar a mi calendario', more: 'Elegir más horas', calTitle: 'Una hora con El Santísimo – Capilla Sagrada Familia, St. Henry',
  },
};

const h12 = (h) => ((h + 11) % 12) + 1;
const ap = (h) => (h % 24 < 12 ? 'AM' : 'PM');
const range = (h) => (ap(h) === ap(h + 1) ? `${h12(h)}–${h12(h + 1)} ${ap(h + 1)}` : `${h12(h)} ${ap(h)}–${h12(h + 1)} ${ap(h + 1)}`);
const loc = (lang) => (lang === 'es' ? 'es-US' : 'en-US');
const dt = (d) => new Date(`${d}T12:00:00Z`);
const dayLong = (d, lang) => dt(d).toLocaleDateString(loc(lang), { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const dayShort = (d, lang) => dt(d).toLocaleDateString(loc(lang), { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
const dayNum = (d) => Number(d.slice(8));
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
  const [activeDay, setActiveDay] = useState('');
  const top = useRef(null);
  const t = T[lang];
  const now = useMemo(etNow, [step, open]);

  useEffect(() => {
    if (navigator.language?.startsWith('es')) setLang('es');
    const q = new URLSearchParams(window.location.search).get('lang'); if (q === 'es' || q === 'en') setLang(q);
    try { const v = JSON.parse(localStorage.getItem('sh-volunteer') || 'null'); if (v) setF((x) => ({ ...x, first_name: v.first_name || '', contact: v.contact || '' })); } catch {}
    refresh();
    const onFocus = () => refresh();
    const onVis = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  function refresh() {
    const mock = new URLSearchParams(window.location.search).get('mock');
    fetch('/api/hours' + (mock ? `?mock=${mock}` : '')).then((r) => r.json()).then((d) => { const o = d.open || []; setOpen(o); setSel((x) => x.filter((k) => o.includes(k))); }).catch(() => {});
  }
  const go = (st) => { setStep(st); setErr(''); requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })); };
  const label = (k) => `${dayShort(k.split('T')[0], lang)} ${range(Number(k.split('T')[1]))}`;
  const toggle = (k) => setSel((x) => (x.includes(k) ? x.filter((y) => y !== k) : [...x, k]));

  const days = Object.entries(OPEN_HOURS)
    .map(([d, hours]) => [d, hours.filter((h) => !hasPassed(d, h, now) && (open || []).includes(slotKey(d, h)))])
    .filter(([, hs]) => hs.length);
  const openCount = days.reduce((n, [, hs]) => n + hs.length, 0);

  async function submit(e, alertsOnly = false) {
    e.preventDefault(); setNotice(''); setErr(''); setBusy(true);
    try {
      const src = new URLSearchParams(window.location.search).get('src') || 'hours-link';
      const r = await fetch('/api/hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, ...(alertsOnly ? { wants_alerts: true, alerts_only: true } : {}), language: lang, slots: alertsOnly ? [] : sel, source: src }) });
      const d = await r.json();
      if (!r.ok) { setErr(d.error || 'Error'); setBusy(false); return; }
      localStorage.setItem('sh-volunteer', JSON.stringify({ first_name: f.first_name, contact: f.contact }));
      if (alertsOnly) { setBusy(false); go('joined'); return; }
      const saved = d.saved || [], taken = d.taken || [];
      setSel([]); refresh();
      if (taken.length) {
        setNotice(t.justTaken(taken.map(label).join(', ')) + (saved.length ? ' ' + t.savedSome(saved.map(label).join(', ')) : ''));
        if (saved.length) setDone((x) => [...x, ...saved]);
        go('pick');
      } else { setDone(saved); go('done'); }
    } catch { setErr('Network error'); }
    setBusy(false);
  }
  function download() {
    const blob = new Blob([ics(done, t.calTitle)], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'adoration-hours.ics'; a.click();
  }
  const jump = (d) => { setActiveDay(d); document.getElementById(`day-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const stepIdx = { pick: 0, form: 1, done: 2, joined: 2 }[step];
  const Contact = (
    <>
      <label className={s.field}><span>{t.name}</span><input required autoComplete="given-name" value={f.first_name} onChange={(e) => setF({ ...f, first_name: e.target.value })} /></label>
      <label className={s.field}><span>{t.contact}</span><input required autoComplete="tel" inputMode="email" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} aria-describedby="contact-hint" /><small id="contact-hint">{t.contactHint}</small></label>
      <input className={s.hp} tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} aria-hidden="true" />
    </>
  );

  return (
    <div className={s.wrap}>
      <div ref={top} />
      <header className={s.top}>
        <div className={s.brand}><span className={s.mark} aria-hidden="true">✦</span><span>{t.kicker}</span></div>
        <button className={s.lang} onClick={() => setLang(lang === 'en' ? 'es' : 'en')} aria-label={t.toggleLabel}>{t.toggle}</button>
      </header>

      <ol className={s.progress} aria-label="Progress">
        {t.steps3.map((x, i) => <li key={x} className={i < stepIdx ? s.past : i === stepIdx ? s.now : ''} aria-current={i === stepIdx ? 'step' : undefined}><span>{i < stepIdx ? '✓' : i + 1}</span>{x}</li>)}
      </ol>

      <main className={s.main}>
        {step === 'pick' && (<div className={s.fade} key="pick">
          <section className={s.hero}>
            <p className={s.parish}>{t.parish} · {WEEK_LABEL[lang]}</p>
            <h1>{t.title}</h1>
            {open && openCount > 0 && <p className={s.impact}><span className={s.pulse} aria-hidden="true" />{t.left(openCount)}</p>}
            {open && openCount > 0 && <p className={s.lead}>{t.intro}</p>}
          </section>

          {notice && <div className={s.notice} role="status">{notice}</div>}
          {!open && <div className={s.skeleton} aria-busy="true"><div /><div /><div /></div>}

          {open && openCount === 0 && (<form className={s.card} onSubmit={(e) => submit(e, true)}>
            <div className={s.bigIcon} aria-hidden="true">🕯️</div>
            <h2 className={s.cardTitle}>{t.covered}</h2><p className={s.muted}>{t.coveredSub}</p>
            {Contact}
            {err && <div className={s.err} role="alert">{err}</div>}
            <button className={s.primary} disabled={busy}>{busy ? t.saving : t.join}</button>
          </form>)}

          {openCount > 0 && (<>
            <nav className={s.days} aria-label="Days">
              {days.map(([d, hs]) => (
                <button key={d} onClick={() => jump(d)} className={activeDay === d ? s.dayOn : ''}>
                  <span className={s.dow}>{dayShort(d, lang)}</span><span className={s.dnum}>{dayNum(d)}</span><span className={s.dcount}>{hs.length}</span>
                </button>))}
            </nav>
            {days.map(([d, hs]) => (
              <section key={d} id={`day-${d}`} className={s.day}>
                <h2>{dayLong(d, lang)}</h2>
                <div className={s.chips}>
                  {hs.map((h) => { const k = slotKey(d, h); const on = sel.includes(k);
                    return (<button key={k} className={`${s.chip} ${on ? s.on : ''}`} onClick={() => toggle(k)} aria-pressed={on}>
                      <span className={s.check} aria-hidden="true">✓</span><span>{range(h)}</span></button>); })}
                </div>
              </section>))}
          </>)}
        </div>)}

        {step === 'form' && (<form className={`${s.fade} ${s.card}`} key="form" onSubmit={submit}>
          <button type="button" className={s.back} onClick={() => go('pick')}>← {t.back}</button>
          <h1 className={s.h1sm}>{t.formTitle}</h1><p className={s.muted}>{t.formSub}</p>
          <div className={s.picks}><span className={s.picksLabel}>{t.yourPicks}</span>{sel.map((k) => <span key={k} className={s.pill}>{label(k)}</span>)}</div>
          {Contact}
          <label className={s.checkRow}><input type="checkbox" checked={f.wants_alerts} onChange={(e) => setF({ ...f, wants_alerts: e.target.checked })} /><span>{t.alerts}</span></label>
          <label className={s.checkRow}><input type="checkbox" checked={f.wants_regular} onChange={(e) => setF({ ...f, wants_regular: e.target.checked })} /><span>{t.regular}</span></label>
          {err && <div className={s.err} role="alert">{err}</div>}
          <button className={s.primary} disabled={busy}>{busy ? t.saving : t.submit}</button>
        </form>)}

        {step === 'done' && (<div className={`${s.fade} ${s.center}`} key="done">
          <svg className={s.tick} viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-15" /></svg>
          <h1 className={s.h1sm}>{t.thanks(f.first_name)}</h1><p className={s.muted}>{t.thanksSub}</p>
          <div className={s.ticket}>{done.map((k) => { const [d, hh] = k.split('T'); return (
            <div key={k} className={s.ticketRow}><span className={s.tday}>{dt(d).toLocaleDateString(loc(lang), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span><span className={s.ttime}>{range(Number(hh))}</span></div>); })}</div>
          <button className={s.primary} onClick={download}>📅 {t.cal}</button>
          <div className={s.expect}><h2>{t.expect}</h2><ol>{t.steps.map((x) => <li key={x}>{x}</li>)}</ol></div>
          <button className={s.ghost} onClick={() => go('pick')}>{t.more}</button>
        </div>)}

        {step === 'joined' && (<div className={`${s.fade} ${s.center}`} key="joined">
          <svg className={s.tick} viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-15" /></svg>
          <h1 className={s.h1sm}>{t.joined}</h1><p className={s.muted}>{t.joinedSub}</p>
        </div>)}
      </main>

      {step === 'pick' && openCount > 0 && (
        <div className={s.bar}><div className={s.barIn}>
          <span className={s.barText} aria-live="polite">{t.selected(sel.length)}</span>
          <button className={s.barBtn} onClick={() => go('form')} disabled={!sel.length}>{t.next} →</button>
        </div></div>)}
    </div>
  );
}
