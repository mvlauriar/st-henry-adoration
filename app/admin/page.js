'use client';

import { useState, useEffect } from 'react';
import { formatDateLabel, formatHourLabel, formatHourRange, upcomingDates, HOURS } from '../../lib/dates';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

      {data.currentHourLive && <CurrentHourPanel live={data.currentHourLive} onAction={patchAction} />}

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
            <div key={s.id} className={`admin-list-row ${s.no_show ? 'no-show-row' : ''}`}>
              <div className="when">{i === 0 ? `${formatDateLabel(date)} · ${formatHourRange(hour)}` : ''}</div>
              <div>
                <div>
                  {s.name}
                  {s.recurring && ' ↻'}
                  {s.walk_in && ' (walk-in)'}
                  {s.recurring_paused && <span className="paused-tag"> paused</span>}
                </div>
                {s.noShowHistory && (s.noShowHistory.count > 0 || s.noShowHistory.lateCount > 0 || s.noShowHistory.veryLateCount > 0) && (
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
                <div className="num" style={{ fontFamily: 'var(--font-numeric)' }}>{s.phone || ''}</div>
                {s.email && <div style={{ fontSize: 13 }}>{s.email}</div>}
                {s.checkedInAtFormatted && (
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
                {s.no_show && <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>⚠ NO-SHOW</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {!s.checkedInAtFormatted && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'checkin')}>Mark present</button>
                )}
                {s.checkedInAtFormatted && !s.checkedOutAtFormatted && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'checkout')}>Check out</button>
                )}
                {s.checkedInAtFormatted && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'undoCheckin')}>Undo check-in</button>
                )}
                {s.recurring_paused && (
                  <button className="delete-btn" onClick={() => patchAction(s.id, 'resumeRecurring')} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>Resume</button>
                )}
                <button className="delete-btn" onClick={() => handleDelete(s.id)}>Remove</button>
              </div>
            </div>
          ));
        })}
      </div>

      <h2 className="admin-h2" style={{ marginTop: 36 }}>Alert recipients</h2>
      <p style={{ color: 'var(--ink-secondary)', fontSize: 15, margin: '0 0 12px' }}>
        These people receive an alert if no one has checked in 5 minutes into an hour.
      </p>
      <CoordinatorList coordinators={data.coordinators} reload={() => load(sessionStorage.getItem('adminPw'))} />

      <button className="btn" style={{ marginTop: 32, maxWidth: 200 }}
        onClick={() => { sessionStorage.removeItem('adminPw'); setAuthed(false); setData(null); setPassword(''); }}>
        Sign out
      </button>
    </div>
  );
}

function CurrentHourPanel({ live, onAction }) {
  const present = live.activelyPresentCount;
  const total = live.scheduled.length;
  const className = present > 0 ? 'live-panel ok' : 'live-panel warn';
  return (
    <div className={className}>
      <div className="live-label">RIGHT NOW · {formatHourRange(live.hour)}</div>
      {total === 0 ? (
        <div className="live-message">⚠ No one scheduled for this hour</div>
      ) : present > 0 ? (
        <div className="live-message">✓ {present} of {total} present</div>
      ) : (
        <div className="live-message">⏳ Waiting for {total} volunteer{total > 1 ? 's' : ''} to arrive</div>
      )}
      <div className="live-volunteers">
        {live.scheduled.map((s) => (
          <div key={s.id} className={`live-volunteer ${s.isActivelyPresent ? 'in' : 'pending'}`}>
            <span className="lv-status">{s.isActivelyPresent ? '✓' : (s.checkedOutAt ? '↩' : '⌛')}</span>
            <span className="lv-name">{s.name}</span>
            <span className="lv-phone">{s.phone || ''}</span>
            {s.checkedInAtFormatted && (
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
