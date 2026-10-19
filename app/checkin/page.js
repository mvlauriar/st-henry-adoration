'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Chapel iPad kiosk — exactly three actions, English and Spanish kept fully separate.
const T = {
  en: {
    lang: 'English', other: 'Español', home: '← Home',
    chapel: 'St. Henry Adoration Chapel',
    checkIn: 'Check In', checkOut: 'Check Out', newHere: 'New Here?',
    present: (n) => n === 0 ? 'No one is checked in yet' : n === 1 ? '1 person is checked in' : `${n} people are checked in`,
    findTitle: 'Tap your name', searchPh: 'Type your name', startTyping: 'Start typing your name to find it.',
    noMatch: 'No names match.', notListed: 'My name is not listed',
    manualTitle: 'Enter your name', manualLabel: 'Full name', manualBtn: 'Check In',
    usual: (h) => `usually ${h.day} ${h.hourLabel}`,
    days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    checkedIn: "You're checked in!", already: 'You are already checked in.', thanks: 'Thank you for being here.',
    leavingTitle: 'Who is leaving?', nobody: 'No one is checked in right now.', since: 'since',
    confirmOut: 'Confirm Check Out', cancel: 'Cancel', outDone: 'You are checked out.', outThanks: 'Thank you. God bless you.',
    welcome: 'Welcome!', welcomeText: 'Interested in volunteering regularly at the Adoration Chapel? Leave your information and someone from the parish can reach out.',
    fullName: 'Full name', phone: 'Phone number', consent: 'The parish may contact me about volunteering.', submit: 'Submit',
    inqThanks: 'Thank you! Someone from the parish will reach out.', checkInNow: 'Check In Now', done: 'Done',
    errName: 'Please enter your full name.', errPhone: 'Please enter a phone number with at least 10 digits.',
    working: 'One moment…',
    netErr: 'We could not reach the system. Nothing was saved. Please try again.',
    serverErr: 'Something went wrong. Nothing was saved. Please try again.',
    tryAgain: 'Try Again',
    offline: 'Connection problem — trying again…',
    help: 'Problem or need a substitute? Call the parish office:',
  },
  es: {
    lang: 'Español', other: 'English', home: '← Inicio',
    chapel: 'Capilla de Adoración San Enrique',
    checkIn: 'Registrar entrada', checkOut: 'Registrar salida', newHere: '¿Es su primera vez?',
    present: (n) => n === 0 ? 'Todavía no hay nadie registrado' : n === 1 ? '1 persona registrada' : `${n} personas registradas`,
    findTitle: 'Toque su nombre', searchPh: 'Escriba su nombre', startTyping: 'Empiece a escribir su nombre para encontrarlo.',
    noMatch: 'Ningún nombre coincide.', notListed: 'Mi nombre no aparece',
    manualTitle: 'Escriba su nombre', manualLabel: 'Nombre completo', manualBtn: 'Registrar entrada',
    usual: (h) => `normalmente ${h.day} ${h.hourLabel}`,
    days: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    checkedIn: '¡Su entrada ha sido registrada!', already: 'Su entrada ya estaba registrada.', thanks: 'Gracias por estar aquí.',
    leavingTitle: '¿Quién se retira?', nobody: 'No hay nadie registrado en este momento.', since: 'desde',
    confirmOut: 'Confirmar salida', cancel: 'Cancelar', outDone: 'Su salida ha sido registrada.', outThanks: 'Gracias. Que Dios le bendiga.',
    welcome: '¡Bienvenido(a)!', welcomeText: '¿Le gustaría ser voluntario(a) regularmente en la Capilla de Adoración? Deje sus datos y alguien de la parroquia podrá comunicarse con usted.',
    fullName: 'Nombre completo', phone: 'Número de teléfono', consent: 'Autorizo a la parroquia a contactarme sobre oportunidades de voluntariado.', submit: 'Enviar',
    inqThanks: '¡Gracias! Alguien de la parroquia se comunicará con usted.', checkInNow: 'Registrar entrada ahora', done: 'Listo',
    errName: 'Por favor escriba su nombre completo.', errPhone: 'Por favor escriba un número de teléfono de al menos 10 dígitos.',
    working: 'Un momento…',
    netErr: 'No pudimos conectar con el sistema. No se guardó nada. Por favor intente de nuevo.',
    serverErr: 'Algo salió mal. No se guardó nada. Por favor intente de nuevo.',
    tryAgain: 'Intentar de nuevo',
    offline: 'Problema de conexión — reintentando…',
    help: '¿Algún problema o necesita un sustituto? Llame a la oficina parroquial:',
  },
};

const PARISH_PHONE = '(954) 785-2450';
const PARISH_TZ = 'America/New_York';

// Shared, untranslated clock in parish time; ticks on the device, no network needed.
function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  const label = now ? new Intl.DateTimeFormat('en-US', { timeZone: PARISH_TZ, hour: 'numeric', minute: '2-digit', hour12: true }).format(now) : '\u00a0';
  return <div className="k-clock" data-testid="kiosk-clock" suppressHydrationWarning>{label}</div>;
}

const IDLE_MS = 60000;      // any flow screen returns home after 60s without a touch
const DONE_MS = 6000;       // confirmation screens return home after 6s
const TIMEOUT_MS = 12000;

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

async function api(path, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET', cache: 'no-store', signal: ctl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    if (!res.ok || !data || data.ok !== true) {
      const err = new Error((data && data.error) || 'server_error'); err.kind = 'server'; throw err;
    }
    return data;
  } catch (e) {
    if (!e.kind) e.kind = 'network';
    throw e;
  } finally { clearTimeout(t); }
}

export default function KioskPage() {
  const [screen, setScreen] = useState({ name: 'home' });
  const [lang, setLang] = useState('en');
  const [status, setStatus] = useState(null);   // { now, active }
  const [offline, setOffline] = useState(false);
  const idleRef = useRef(null);

  const refresh = useCallback(async () => {
    try { const d = await api('/api/checkin'); setStatus(d); setOffline(false); return d; }
    catch { setOffline(true); return null; }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30000);
    const vis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', refresh);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', refresh); };
  }, [refresh]);

  const goHome = useCallback(() => { setScreen({ name: 'home' }); refresh(); }, [refresh]);

  // Inactivity: return home from any flow screen.
  useEffect(() => {
    if (screen.name === 'home') return;
    const ms = screen.name.endsWith('Done') ? DONE_MS : IDLE_MS;
    const arm = () => { clearTimeout(idleRef.current); idleRef.current = setTimeout(goHome, ms); };
    arm();
    const evs = ['pointerdown', 'keydown', 'input'];
    if (!screen.name.endsWith('Done')) evs.forEach((e) => window.addEventListener(e, arm));
    return () => { clearTimeout(idleRef.current); evs.forEach((e) => window.removeEventListener(e, arm)); };
  }, [screen, goHome]);

  const fail = (prev) => (e) => setScreen({ name: 'error', e, retry: () => setScreen({ name: prev === 'newHereThanks' ? 'newHere' : prev }) });
  const start = (name, l) => { setLang(l); setScreen({ name }); };
  const t = T[lang];

  if (screen.name === 'home') {
    return (
      <div className="k-home-wrap">
        <header className="k-header">
          <div className="k-title-shared">St. Henry</div>
          <Clock />
        </header>
        <div className="k-home">
          {['en', 'es'].map((l) => (
            <section key={l} className={`k-panel k-${l}`} lang={l} aria-label={T[l].lang}>
              <div className="k-actions">
                <button className="k-btn k-primary" data-testid={`home-checkin-${l}`} onClick={() => start('checkin', l)}>{T[l].checkIn}</button>
                <button className="k-btn" data-testid={`home-checkout-${l}`} onClick={() => start('checkout', l)}>{T[l].checkOut}</button>
                <button className="k-btn k-quiet" data-testid={`home-new-${l}`} onClick={() => start('newHere', l)}>{T[l].newHere}</button>
              </div>
              <p className="k-help" data-testid={`help-${l}`}>{T[l].help} <span className="k-phone">{PARISH_PHONE}</span></p>
            </section>
          ))}
        </div>
        {offline && <div className="k-offline" role="status">{T.en.offline} · {T.es.offline}</div>}
      </div>
    );
  }

  return (
    <div className={`k-flow k-${lang}`} lang={lang}>
      <div className="k-topbar">
        <button className="k-small" data-testid="nav-home" onClick={goHome}>{t.home}</button>
        <button className="k-small" data-testid="nav-lang" onClick={() => setLang(lang === 'en' ? 'es' : 'en')}>{t.other}</button>
      </div>
      <main className="k-main">
        {screen.name === 'checkin' && <CheckInFlow t={t} lang={lang} onDone={(r) => setScreen({ name: 'checkinDone', r })} onError={fail(screen.name)} />}
        {screen.name === 'checkinDone' && (
          <Done title={screen.r.already ? t.already : t.checkedIn} sub={`${screen.r.displayName} · ${t.thanks}`} t={t} onHome={goHome} />
        )}
        {screen.name === 'checkout' && <CheckOutFlow t={t} active={status?.active} refresh={refresh} onDone={() => { setScreen({ name: 'checkoutDone' }); refresh(); }} onError={fail(screen.name)} />}
        {screen.name === 'checkoutDone' && <Done title={t.outDone} sub={t.outThanks} t={t} onHome={goHome} />}
        {screen.name === 'newHere' && <NewHereFlow t={t} onDone={(id, name) => setScreen({ name: 'newHereThanks', id, fullName: name })} onError={fail(screen.name)} />}
        {screen.name === 'newHereThanks' && (
          <NewHereThanks t={t} inquiryId={screen.id} onHome={goHome}
            onCheckedIn={(r) => setScreen({ name: 'checkinDone', r })}
            onError={fail(screen.name)} />
        )}
        {screen.name === 'error' && (
          <div className="k-center" role="alert" data-testid="error-screen">
            <h1 className="k-title k-err">{screen.e?.kind === 'network' ? t.netErr : t.serverErr}</h1>
            <div className="k-row">
              <button className="k-btn k-primary" onClick={() => screen.retry ? screen.retry() : goHome()}>{t.tryAgain}</button>
              <button className="k-btn" onClick={goHome}>{t.home.replace('← ', '')}</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Done({ title, sub, t, onHome }) {
  return (
    <div className="k-center" data-testid="done-screen">
      <div className="k-seal">✓</div>
      <h1 className="k-title">{title}</h1>
      <p className="k-sub">{sub}</p>
      <button className="k-btn k-primary k-narrow" onClick={onHome}>{t.done}</button>
    </div>
  );
}

function CheckInFlow({ t, lang, onDone, onError }) {
  const [dir, setDir] = useState(null);
  const [q, setQ] = useState('');
  const [manual, setManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try { const d = await api('/api/checkin?directory=1'); setDir(d.directory); }
      catch (e) { onError(e, null); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(body) {
    if (busy) return;
    setBusy(true);
    try { const r = await api('/api/checkin', { action: 'checkin', ...body }); onDone(r); }
    catch (e) { setBusy(false); onError(e, null); }
  }

  if (manual) {
    return (
      <form className="k-form" onSubmit={(e) => { e.preventDefault(); if (manualName.trim().length < 2) { setErr(t.errName); return; } submit({ manualName: manualName.trim() }); }}>
        <h1 className="k-title">{t.manualTitle}</h1>
        <label className="k-label" htmlFor="mname">{t.manualLabel}</label>
        <input id="mname" data-testid="manual-name" className="k-input" autoComplete="off" autoCapitalize="words" value={manualName} onChange={(e) => { setManualName(e.target.value); setErr(''); }} autoFocus />
        {err && <div className="k-error">{err}</div>}
        <button className="k-btn k-primary" data-testid="manual-submit" disabled={busy}>{busy ? t.working : t.manualBtn}</button>
      </form>
    );
  }

  const nq = norm(q);
  const list = (dir || []).filter((d) => !nq || d.search.split(' ').some((w) => w.startsWith(nq)) || d.search.startsWith(nq));
  const shown = nq ? list.slice(0, 30) : list.filter((d) => d.scheduledNow);

  return (
    <div className="k-find">
      <h1 className="k-title">{t.findTitle}</h1>
      <input className="k-input" data-testid="search" placeholder={t.searchPh} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoCorrect="off" spellCheck={false} />
      <div className="k-names">
        {dir === null && <p className="k-sub">{t.working}</p>}
        {dir !== null && shown.map((d) => (
          <button key={d.key} className="k-name" data-testid="name-option" disabled={busy} onClick={() => submit({ key: d.key })}>
            <span>{d.displayName}</span>
            {d.hint && <span className="k-hint">{t.usual({ day: t.days[d.hint.weekday], hourLabel: d.hint.hourLabel })}</span>}
          </button>
        ))}
        {dir !== null && !nq && shown.length === 0 && <p className="k-sub">{t.startTyping}</p>}
        {dir !== null && nq && shown.length === 0 && <p className="k-sub">{t.noMatch}</p>}
      </div>
      <button className="k-btn k-quiet" data-testid="not-listed" onClick={() => { setManual(true); setManualName(q); }}>{t.notListed}</button>
    </div>
  );
}

function CheckOutFlow({ t, active, refresh, onDone, onError }) {
  const [list, setList] = useState(active || null);
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { (async () => { const d = await refresh(); if (d) setList(d.active); else if (!active) onError({ kind: 'network' }, null); })(); }, []); // eslint-disable-line

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try { await api('/api/checkin', { action: 'checkout', id: pick.id }); onDone(); }
    catch (e) { setBusy(false); onError(e, null); }
  }

  if (pick) {
    return (
      <div className="k-center">
        <h1 className="k-title">{pick.displayName}</h1>
        <div className="k-row">
          <button className="k-btn k-primary" data-testid="confirm-checkout" disabled={busy} onClick={confirm}>{busy ? t.working : t.confirmOut}</button>
          <button className="k-btn" disabled={busy} onClick={() => setPick(null)}>{t.cancel}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="k-find">
      <h1 className="k-title">{t.leavingTitle}</h1>
      <div className="k-names">
        {list === null && <p className="k-sub">{t.working}</p>}
        {list && list.length === 0 && <p className="k-sub" data-testid="nobody">{t.nobody}</p>}
        {list && list.map((a) => (
          <button key={a.id} className="k-name" data-testid="active-option" onClick={() => setPick(a)}>
            <span>{a.displayName}</span><span className="k-hint">{t.since} {a.since}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NewHereFlow({ t, onDone, onError }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) { setErr(t.errName); return; }
    if (phone.replace(/\D/g, '').length < 10) { setErr(t.errPhone); return; }
    setBusy(true);
    try { const r = await api('/api/inquiry', { fullName: name.trim(), phone: phone.trim(), consent }); onDone(r.id, name.trim()); }
    catch (e2) { setBusy(false); onError(e2, null); }
  }
  return (
    <form className="k-form" onSubmit={submit}>
      <h1 className="k-title">{t.welcome}</h1>
      <p className="k-sub">{t.welcomeText}</p>
      <label className="k-label" htmlFor="iname">{t.fullName}</label>
      <input id="iname" data-testid="inq-name" className="k-input" autoComplete="off" autoCapitalize="words" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} />
      <label className="k-label" htmlFor="iphone">{t.phone}</label>
      <input id="iphone" data-testid="inq-phone" className="k-input" type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => { setPhone(e.target.value); setErr(''); }} />
      <label className="k-check">
        <input type="checkbox" data-testid="inq-consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>{t.consent}</span>
      </label>
      {err && <div className="k-error" data-testid="form-error">{err}</div>}
      <button className="k-btn k-primary" data-testid="inq-submit" disabled={busy}>{busy ? t.working : t.submit}</button>
    </form>
  );
}

function NewHereThanks({ t, inquiryId, onHome, onCheckedIn, onError }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy) return;
    setBusy(true);
    try { const r = await api('/api/checkin', { action: 'checkin', inquiryId }); onCheckedIn(r); }
    catch (e) { setBusy(false); onError(e, null); }
  }
  return (
    <div className="k-center" data-testid="inq-thanks">
      <div className="k-seal">✓</div>
      <h1 className="k-title">{t.inqThanks}</h1>
      <div className="k-row">
        <button className="k-btn k-primary" data-testid="inq-checkin" disabled={busy} onClick={go}>{busy ? t.working : t.checkInNow}</button>
        <button className="k-btn" onClick={onHome}>{t.done}</button>
      </div>
    </div>
  );
}
