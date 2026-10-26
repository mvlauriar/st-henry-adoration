'use client';

import { useState, useEffect } from 'react';
import { formatDateLabel, formatHourLabel, formatHourRange, upcomingDates, HOURS } from '../../lib/dates';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Read this from window because it's a client component.
  // Set NEXT_PUBLIC_CHECKIN_ENABLED=true in Vercel when iPad goes live.
  const checkinEnabled = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_CHECKIN_ENABLED === 'true';

  async function load(pw) {
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/admin', { method: 'POST', headers: { 'x-admin-password': pw } });
      if (res.status === 401) { setError('Incorrect password.'); setLoading(false); return; }
      if (!res.ok) { setError('Could not load data.'); setLoading(false); return; }
      const d = await res.json();
      setData(d); setAuthed(true);
      sessionStorage.setItem('adminPw', pw);
    } catch { setError('Network error.'); }
    setLoading(false);
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('adminPw');
    if (saved) { setPassword(saved); load(saved); }
  }, []);

  async function handleDelete(id) {
    if (!confirm('Remove this signup?')) return;
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', { method: 'DELETE', headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    load(pw);
  }

  async function patchAction(signupId, action) {
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', { method: 'PATCH', headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinatorId: signupId, action }) });
    load(pw);
  }

  if (!authed) {
    return (
      <div className="page" style={{ maxWidth: 420 }}>
        <header className="masthead">
          <div className="ornament">✦</div>
          <h1 style={{ fontSize: 32 }}>Admin</h1>
        </header>
        <form onSubmit={(e) => { e.preventDefault(); load(password); }}>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          {error && <div className="error-text">{error}</div>}
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Loading…' : 'Sign In'}</button>
          </div>
        </form>
      </div>
    );
  }

  if (!data) return <div className="page">Loading…</div>;

  const byDateHour = {};
  for (const s of data.signups) {
    const key = `${s.slot_date}__${s.slot_hour}`;
    if (!byDateHour[key]) byDateHour[key] = [];
    byDateHour[key].push(s);
  }
  const rows = [];
  for (const d of data.dates) for (const h of data.hours) rows.push({ date: d, hour: h, list: byDateHour[`${d}__${h}`] || [] });

  return (
    <div className="page">
      <header className="masthead">
        <div className="ornament">✦</div>
        <h1 style={{ fontSize: 30 }}>Admin Dashboard</h1>
        <div className="parish">{data.empty.length} empty hour{data.empty.length === 1 ? '' : 's'} this week</div>
      </header>

      <VolunteersAdmin />

      {data.kiosk && <KioskAdmin k={data.kiosk} reload={() => load(sessionStorage.getItem('adminPw'))} />}

      {!checkinEnabled && (
        <div style={{
          background: '#fef9ee',
          border: '1.5px solid #d4a945',
          borderRadius: 6,
          padding: '14px 18px',
          margin: '16px 0 24px',
          color: '#5e3e0a',
          fontSize: 15,
          lineHeight: 1.45,
        }}>
          <strong>Check-in is currently disabled.</strong> No-show tracking, lateness badges, and uncovered-hour alerts are paused while the iPad kiosk is not yet live at the chapel. When you're ready to go live, set <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 3 }}>CHECKIN_ENABLED=true</code> and <code style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 6px', borderRadius: 3 }}>NEXT_PUBLIC_CHECKIN_ENABLED=true</code> in Vercel.
        </div>
      )}

      {data.currentHourLive && <CurrentHourPanel live={data.currentHourLive} onAction={patchAction} checkinEnabled={checkinEnabled} />}

      <h2 className="admin-h2">Coverage at a glance</h2>
      <div className="admin-grid" style={{ gridTemplateColumns: `110px repeat(${data.hours.length}, 1fr)` }}>
        <div className="admin-cell header"></div>
        {data.hours.map((h) => (<div key={h} className="admin-cell header">{formatHourLabel(h).replace(':00 ', '')}</div>))}
        {data.dates.map((d) => (<FragmentRow key={d} date={d} hours={data.hours} grid={data.grid} slotsPerHour={data.slotsPerHour} />))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink-secondary)', margin: '0 0 24px', flexWrap: 'wrap' }}>
        <Legend color="var(--red-bg)" textColor="var(--red)" label="Empty" />
        <Legend color="var(--amber-bg)" textColor="#6e4a0e" label="Partial" />
        <Legend color="var(--green-bg)" textColor="var(--green)" label="Full" />
      </div>

      <h2 className="admin-h2">Manually add a signup</h2>
      <ManualAddForm reload={() => load(sessionStorage.getItem('adminPw'))} />

      <h2 className="admin-h2" style={{ marginTop: 32 }}>Upcoming signups</h2>
      <div className="admin-list">
        {rows.map(({ date, hour, list }) => {
          if (list.length === 0) {
            return (
              <div key={`${date}-${hour}`} className="admin-list-row empty-flag">
                <div className="when">{formatDateLabel(date)} · {formatHourRange(hour)}</div>
                <div style={{ gridColumn: 'span 3' }}>⚑ No volunteers yet</div>
              </div>
            );
          }
          return list.map((s, i) => (
            <div key={s.id} className={`admin-list-row ${checkinEnabled && s.no_show ? 'no-show-row' : ''}`}>
              <div className="when">{i === 0 ? `${formatDateLabel(date)} · ${formatHourRange(hour)}` : ''}</div>
              <div>
                <div>
                  {s.name}
                  {s.recurring && ' ↻'}
                  {s.walk_in && ' (walk-in)'}
                  {checkinEnabled && s.recurring_paused && <span className="paused-tag"> paused</span>}
                </div>
                {checkinEnabled && s.noShowHistory && (s.noShowHistory.count > 0 || s.noShowHistory.lateCount > 0 || s.noShowHistory.veryLateCount > 0) && (
                  <div className="history-note">
                    {s.noShowHistory.count > 0 && <span className="hist-no-show">⚠ {s.noShowHistory.count} prior no-show{s.noShowHistory.count > 1 ? 's' : ''}</span>}
                    {(s.noShowHistory.lateCount + s.noShowHistory.veryLateCount) > 0 && (
                      <span className="hist-late">⏱ {s.noShowHistory.lateCount + s.noShowHistory.veryLateCount} late arrival{(s.noShowHistory.lateCount + s.noShowHistory.veryLateCount) > 1 ? 's' : ''}</span>
                    )}
                    <span className="hist-attended">({s.noShowHistory.attended} attended)</span>
                  </div>
                )}
              </div>
              <div style={{ color: 'var(--ink-secondary)', fontSize: 14 }}>
                <div style={{ fontFamily: 'var(--font-numeric)' }}>{s.phone || ''}</div>
                {s.email && <div style={{ fontSize: 13 }}>{s.email}</div>}
                {checkinEnabled && s.checkedInAtFormatted && (
                  <div className="checkin-line">
                    <span className="checkin-green">✓ In {s.checkedInAtFormatted}</span>
                    {s.checkedOutAtFormatted && <span className="checkout-grey">↩ Out {s.checkedOutAtFormatted}</span>}
                    {s.lateness && (s.lateness.category === 'late' || s.lateness.category === 'veryLate') && (
                      <span className={`lateness-badge ${s.lateness.category}`}>{s.lateness.label}</span>
                    )}
                    {s.lateness && s.lateness.category === 'early' && s.lateness.minutesLate <= -5 && (
                      <span className="lateness-badge early">{s.lateness.label}</span>
                    )}
                  </div>
                )}
                {checkinEnabled && s.no_show && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>⚠ NO-SHOW</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {checkinEnabled && !s.checkedInAtFormatted && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'checkin')}>Mark present</button>
                )}
                {checkinEnabled && s.checkedInAtFormatted && !s.checkedOutAtFormatted && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'checkout')}>Check out</button>
                )}
                {checkinEnabled && s.checkedInAtFormatted && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'undoCheckin')}>Undo check-in</button>
                )}
                {checkinEnabled && s.recurring_paused && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'resumeRecurring')} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>Resume</button>
                )}
                <button className="delete-btn" onClick={() => handleDelete(s.id)}>Remove</button>
              </div>
            </div>
          ));
        })}
      </div>

      {checkinEnabled && (
        <>
          <h2 className="admin-h2" style={{ marginTop: 36 }}>Alert recipients</h2>
          <p style={{ color: 'var(--ink-secondary)', fontSize: 15, margin: '0 0 12px' }}>
            These people receive an alert if no one has checked in 5 minutes into an hour.
          </p>
          <CoordinatorList coordinators={data.coordinators} reload={() => load(sessionStorage.getItem('adminPw'))} />
        </>
      )}

      <button className="btn" style={{ marginTop: 32, maxWidth: 200 }}
        onClick={() => { sessionStorage.removeItem('adminPw'); setAuthed(false); setData(null); setPassword(''); }}>
        Sign out
      </button>
    </div>
  );
}

function CurrentHourPanel({ live, onAction, checkinEnabled }) {
  const present = live.activelyPresentCount;
  const total = live.scheduled.length;

  // When check-in is disabled, don't use warn/ok colors based on presence — just show neutral info
  let className, message;
  if (!checkinEnabled) {
    className = 'live-panel';
    if (total === 0) message = 'No one scheduled for this hour';
    else message = `${total} scheduled for this hour`;
  } else {
    className = present > 0 ? 'live-panel ok' : 'live-panel warn';
    if (total === 0) message = '⚠ No one scheduled for this hour';
    else if (present > 0) message = `✓ ${present} of ${total} present`;
    else message = `⏳ Waiting for ${total} volunteer${total > 1 ? 's' : ''} to arrive`;
  }

  return (
    <div className={className} style={!checkinEnabled ? { background: 'var(--bg-card)', borderColor: 'var(--rule)', color: 'var(--ink-strong)' } : undefined}>
      <div className="live-label">RIGHT NOW · {formatHourRange(live.hour)}</div>
      <div className="live-message">{message}</div>
      <div className="live-volunteers">
        {live.scheduled.map((s) => (
          <div key={s.id} className={`live-volunteer ${s.isActivelyPresent ? 'in' : 'pending'}`}>
            {checkinEnabled && <span className="lv-status">{s.isActivelyPresent ? '✓' : (s.checkedOutAt ? '↩' : '⌛')}</span>}
            <span className="lv-name">{s.name}</span>
            <span className="lv-phone">{s.phone || ''}</span>
            {checkinEnabled && s.checkedInAtFormatted && (
              <span className="lv-time">
                in {s.checkedInAtFormatted}
                {s.checkedOutAtFormatted && ` · out ${s.checkedOutAtFormatted}`}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualAddForm({ reload }) {
  const dates = upcomingDates(7);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState(dates[0]);
  const [hour, setHour] = useState(HOURS[0]);
  const [markPresent, setMarkPresent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name required.'); return; }
    if (!phone.trim()) { setError('Phone required.'); return; }
    setSubmitting(true);
    const pw = sessionStorage.getItem('adminPw');
    const res = await fetch('/api/admin', {
      method: 'PUT',
      headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'signup', name, phone, email, slot_date: date, slot_hour: hour, mark_present: markPresent }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Could not add.'); setSubmitting(false); return; }
    setName(''); setPhone(''); setEmail(''); setMarkPresent(false);
    setSubmitting(false);
    reload();
  }

  return (
    <form className="manual-add-card" onSubmit={submit}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="field">
          <label>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label>Phone</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="field">
          <label>Email (optional)</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Date</label>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => <option key={d} value={d}>{formatDateLabel(d)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Hour</label>
          <select value={hour} onChange={(e) => setHour(parseInt(e.target.value, 10))}>
            {HOURS.map((h) => <option key={h} value={h}>{formatHourRange(h)}</option>)}
          </select>
        </div>
        <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 14, fontWeight: 500 }}>
            <input type="checkbox" checked={markPresent} onChange={(e) => setMarkPresent(e.target.checked)} style={{ width: 18, height: 18 }} />
            Mark as present now
          </label>
        </div>
      </div>
      {error && <div className="error-text">{error}</div>}
      <div className="btn-row" style={{ marginTop: 4 }}>
        <button type="submit" className="btn btn-primary" disabled={submitting} style={{ maxWidth: 240 }}>
          {submitting ? 'Adding…' : 'Add signup'}
        </button>
      </div>
    </form>
  );
}

function CoordinatorList({ coordinators, reload }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  async function add(e) {
    e.preventDefault();
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', { method: 'PUT', headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, email }) });
    setName(''); setPhone(''); setEmail(''); setAdding(false);
    reload();
  }

  async function patch(coordinatorId, action) {
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', { method: 'PATCH', headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' }, body: JSON.stringify({ coordinatorId, action }) });
    reload();
  }

  return (
    <>
      <div className="admin-list">
        {coordinators.length === 0 && (
          <div className="admin-list-row" style={{ gridTemplateColumns: '1fr' }}>
            <em style={{ color: 'var(--ink-secondary)' }}>No coordinators yet. Add one below.</em>
          </div>
        )}
        {coordinators.map((c) => (
          <div key={c.id} className="admin-list-row" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
            <div>{c.name}{!c.active && <em style={{ color: 'var(--ink-secondary)' }}> (paused)</em>}</div>
            <div style={{ color: 'var(--ink-secondary)' }}>{c.phone || '—'}</div>
            <div style={{ color: 'var(--ink-secondary)' }}>{c.email || '—'}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="delete-btn" onClick={() => patch(c.id, 'toggle')}>{c.active ? 'Pause' : 'Resume'}</button>
              <button className="delete-btn" onClick={() => { if (confirm('Remove?')) patch(c.id, 'remove'); }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
      {adding ? (
        <form onSubmit={add} style={{ marginTop: 16, background: 'var(--bg-card)', padding: 16, borderRadius: 4, border: '1px solid var(--rule)' }}>
          <div className="field"><label>Name</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="field"><label>Phone</label><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" /></div>
          <div className="field"><label>Email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" style={{ marginTop: 12, maxWidth: 240 }} onClick={() => setAdding(true)}>+ Add coordinator</button>
      )}
    </>
  );
}

function FragmentRow({ date, hours, grid, slotsPerHour }) {
  return (
    <>
      <div className="admin-cell day-label">{formatDateLabel(date)}</div>
      {hours.map((h) => {
        const f = grid[date]?.[h] || 0;
        const cls = f === 0 ? 'empty' : f >= slotsPerHour ? 'full' : 'partial';
        return <div key={h} className={`admin-cell ${cls}`}>{f}</div>;
      })}
    </>
  );
}

function Legend({ color, textColor, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 14, height: 14, background: color, border: '1px solid var(--rule)', display: 'inline-block' }} />
      <span style={{ color: textColor }}>{label}</span>
    </span>
  );
}

// ---------------- Kiosk V2: attendance, corrections, inquiries, audit ----------------
async function adminPatch(body) {
  const pw = sessionStorage.getItem('adminPw');
  const res = await fetch('/api/admin', { method: 'PATCH', headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert('Could not save: ' + (d.error || res.status)); return false; }
  return true;
}
const toLocalInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

function KioskAdmin({ k, reload }) {
  if (k.error) return <div className="live-panel warn"><div className="live-message">Attendance data unavailable: {k.error}</div></div>;
  const covered = k.active.length > 0;
  return (
    <section data-testid="kiosk-admin">
      <div className={`live-panel ${covered ? 'ok' : 'warn'}`} data-testid="coverage-status">
        <div className="live-label">CHAPEL COVERAGE · RIGHT NOW</div>
        <div className="live-message">
          {covered ? `✓ ${k.active.length} checked in on the iPad` : '⚠ Unattended / unconfirmed coverage — nobody is checked in'}
        </div>
        {!covered && <div style={{ fontSize: 14 }}>A blank list means nobody has confirmed presence on the iPad; the chapel may or may not be empty.</div>}
      </div>

      <h2 className="admin-h2">Checked in now</h2>
      <div className="admin-list">
        {k.active.length === 0 && <div className="admin-list-row"><em>Nobody checked in.</em></div>}
        {k.active.map((a) => <AttendanceRow key={a.id} a={a} reload={reload} long={a.longFlag} longHours={k.longHours} />)}
      </div>

      <h2 className="admin-h2">New Volunteer Inquiries</h2>
      {k.inquiries === null ? <div className="admin-list-row"><em>Inquiries table not found — run supabase/migrations/2026-10-19-kiosk-v2.sql.</em></div> : (
        <div className="admin-list" data-testid="inquiries">
          {k.inquiries.length === 0 && <div className="admin-list-row"><em>No inquiries yet.</em></div>}
          {k.inquiries.map((i) => (
            <div key={i.id} className="admin-list-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
              <strong>{i.full_name}</strong>
              <span>{i.phone}</span>
              <span>{new Date(i.created_at).toLocaleString()}</span>
              <span>{i.consent ? 'Consented to contact' : 'NO consent to contact'}</span>
              <span>Status: <b>{i.status}</b></span>
              {i.status !== 'contacted' && <button className="btn" style={{ maxWidth: 150 }} onClick={async () => { if (await adminPatch({ action: 'inquiryStatus', id: i.id, status: 'contacted' })) reload(); }}>Mark contacted</button>}
              {i.status !== 'resolved' && <button className="btn" style={{ maxWidth: 150 }} onClick={async () => { if (await adminPatch({ action: 'inquiryStatus', id: i.id, status: 'resolved' })) reload(); }}>Mark resolved</button>}
            </div>
          ))}
        </div>
      )}

      <h2 className="admin-h2">Attendance history (last 7 days)</h2>
      <div className="admin-list">
        {k.history.length === 0 && <div className="admin-list-row"><em>No completed visits yet.</em></div>}
        {k.history.map((a) => <AttendanceRow key={a.id} a={a} reload={reload} />)}
      </div>

      <details style={{ margin: '16px 0 32px' }}>
        <summary className="admin-h2" style={{ cursor: 'pointer' }}>Audit trail</summary>
        {k.audit === null ? <em>Audit table not found — run the kiosk-v2 migration.</em> : (
          <div className="admin-list">
            {k.audit.map((x) => (
              <div key={x.id} className="admin-list-row" style={{ fontSize: 13 }}>
                {new Date(x.created_at).toLocaleString()} · {x.source} · {x.action} {x.note ? `· ${x.note}` : ''} {x.old_value ? `· was ${x.old_value}` : ''} {x.new_value ? `· now ${x.new_value}` : ''}
              </div>
            ))}
          </div>
        )}
      </details>
    </section>
  );
}

function AttendanceRow({ a, reload, long, longHours }) {
  const [edit, setEdit] = useState(false);
  const [inV, setInV] = useState(toLocalInput(a.checkedInAt));
  const [outV, setOutV] = useState(toLocalInput(a.checkedOutAt));
  const [note, setNote] = useState('');
  return (
    <div className="admin-list-row" style={{ display: 'block', background: long ? 'var(--amber-bg)' : undefined }} data-testid={long ? 'long-flag' : undefined}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <strong>{a.name}</strong>{a.walkIn && <span>(walk-in)</span>}
        <span>{a.phone || ''}</span>
        <span>In {a.inLabel}{a.outLabel ? ` · Out ${a.outLabel}` : ' · still here'}</span>
        <span>{a.hours} h</span>
        {long && <b style={{ color: 'var(--red)' }}>⚑ Over {longHours} h — review (forgotten checkout?)</b>}
        {!a.checkedOutAt && <button className="btn" style={{ maxWidth: 160 }} onClick={async () => { if (confirm(`Check out ${a.name} now?`) && await adminPatch({ action: 'checkoutNow', id: a.id })) reload(); }}>Check out now</button>}
        <button className="btn" style={{ maxWidth: 120 }} onClick={() => setEdit(!edit)}>{edit ? 'Close' : 'Correct'}</button>
      </div>
      {edit && (
        <form style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 10, alignItems: 'flex-end' }} onSubmit={async (e) => {
          e.preventDefault();
          if (!note.trim()) { alert('Please add a reason for the audit trail.'); return; }
          const body = { action: 'correction', id: a.id, note: note.trim(), checked_in_at: inV ? new Date(inV).toISOString() : null, checked_out_at: outV ? new Date(outV).toISOString() : null };
          if (await adminPatch(body)) { setEdit(false); reload(); }
        }}>
          <label>Arrived<br /><input type="datetime-local" value={inV} onChange={(e) => setInV(e.target.value)} /></label>
          <label>Left<br /><input type="datetime-local" value={outV} onChange={(e) => setOutV(e.target.value)} /></label>
          <label>Reason (required)<br /><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. forgot to check out" /></label>
          <button className="btn btn-primary" style={{ maxWidth: 160 }}>Save correction</button>
        </form>
      )}
    </div>
  );
}

function VolunteersAdmin() {
  const [d, setD] = useState(null); const [err, setErr] = useState('');
  useEffect(() => {
    fetch('/api/admin/volunteers', { method: 'POST', headers: { 'x-admin-password': sessionStorage.getItem('adminPw') || '' } })
      .then(async (r) => { const j = await r.json(); if (!r.ok) setErr(j.error || 'Error'); else setD(j); }).catch(() => setErr('Network error'));
  }, []);
  const fmt = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' });
  function csv(rows, name) {
    const keys = Object.keys(rows[0] || {});
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const text = [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click();
  }
  if (err) return <div style={{ margin: '16px 0', color: 'var(--ink-secondary)' }}><h2 className="admin-h2">Open-hour sign-ups</h2>{err}</div>;
  if (!d) return null;
  const byId = Object.fromEntries(d.volunteers.map((v) => [v.id, v]));
  const bySlot = {};
  for (const s of d.signups) (bySlot[s.slot_start] ||= []).push(byId[s.volunteer_id]);
  const flat = d.signups.map((s) => { const v = byId[s.volunteer_id] || {}; return { slot: fmt(s.slot_start), name: v.first_name, contact: v.contact, language: v.language, wants_alerts: v.wants_alerts, wants_regular: v.wants_regular, campaign: s.campaign }; });
  return (
    <div style={{ margin: '16px 0 28px' }}>
      <h2 className="admin-h2">Open-hour sign-ups ({d.signups.length})</h2>
      {Object.entries(bySlot).map(([slot, vs]) => (
        <div key={slot} style={{ padding: '6px 0', borderBottom: '1px solid #eee' }}><b>{fmt(slot)}</b>: {vs.map((v) => v ? `${v.first_name} (${v.contact})` : '?').join(', ')}</div>
      ))}
      {!d.signups.length && <div>No sign-ups yet.</div>}
      <h2 className="admin-h2" style={{ marginTop: 20 }}>Volunteer roster ({d.volunteers.length}, {d.volunteers.filter((v) => v.wants_alerts).length} opted in to alerts)</h2>
      {d.volunteers.map((v) => (
        <div key={v.id} style={{ padding: '4px 0' }}>{v.first_name} · {v.contact} · {v.language.toUpperCase()}{v.wants_alerts ? ' · alerts ✓' : ''}{v.wants_regular ? ' · wants regular hour' : ''}</div>
      ))}
      <div className="btn-row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => csv(flat, 'signups.csv')} disabled={!flat.length}>Sign-ups CSV</button>
        <button className="btn" onClick={() => csv(d.volunteers, 'volunteers.csv')} disabled={!d.volunteers.length}>Roster CSV</button>
      </div>
    </div>
  );
}
