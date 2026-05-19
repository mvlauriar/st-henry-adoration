'use client';

import { useState, useEffect } from 'react';
import { formatDateLabel, formatHourLabel, formatHourRange } from '../../lib/dates';

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [authed, setAuthed] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(pw) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'x-admin-password': pw },
      });
      if (res.status === 401) { setError('Incorrect password.'); setLoading(false); return; }
      if (!res.ok) { setError('Could not load data.'); setLoading(false); return; }
      const d = await res.json();
      setData(d);
      setAuthed(true);
      sessionStorage.setItem('adminPw', pw);
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  }

  useEffect(() => {
    const saved = sessionStorage.getItem('adminPw');
    if (saved) { setPassword(saved); load(saved); }
  }, []);

  async function handleDelete(id) {
    if (!confirm('Remove this signup?')) return;
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', {
      method: 'DELETE',
      headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load(pw);
  }

  async function resumeRecurring(signupId) {
    if (!confirm('Resume this volunteer\'s recurring slots?')) return;
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinatorId: signupId, action: 'resumeRecurring' }),
    });
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
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Loading…' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  if (!data) return <div className="page">Loading…</div>;

  // Group signups by date+hour for the list
  const byDateHour = {};
  for (const s of data.signups) {
    const key = `${s.slot_date}__${s.slot_hour}`;
    if (!byDateHour[key]) byDateHour[key] = [];
    byDateHour[key].push(s);
  }

  const rows = [];
  for (const d of data.dates) {
    for (const h of data.hours) {
      const key = `${d}__${h}`;
      rows.push({ date: d, hour: h, list: byDateHour[key] || [] });
    }
  }

  return (
    <div className="page">
      <header className="masthead">
        <div className="ornament">✦</div>
        <h1 style={{ fontSize: 30 }}>Admin Dashboard</h1>
        <div className="parish">{data.empty.length} empty hour{data.empty.length === 1 ? '' : 's'} this week</div>
      </header>

      {/* Live current-hour panel */}
      {data.currentHourLive && <CurrentHourPanel live={data.currentHourLive} />}

      {/* Coverage grid */}
      <h2 className="admin-h2">Coverage at a glance</h2>
      <div className="admin-grid" style={{ gridTemplateColumns: `110px repeat(${data.hours.length}, 1fr)` }}>
        <div className="admin-cell header"></div>
        {data.hours.map((h) => (
          <div key={h} className="admin-cell header">{formatHourLabel(h).replace(':00 ', '')}</div>
        ))}
        {data.dates.map((d) => (
          <FragmentRow key={d} date={d} hours={data.hours} grid={data.grid} slotsPerHour={data.slotsPerHour} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink-secondary)', margin: '0 0 24px', flexWrap: 'wrap' }}>
        <Legend color="var(--red-bg)" textColor="var(--red)" label="Empty" />
        <Legend color="var(--amber-bg)" textColor="#6e4a0e" label="Partial" />
        <Legend color="var(--green-bg)" textColor="var(--green)" label="Full" />
      </div>

      {/* Signups list */}
      <h2 className="admin-h2">Upcoming signups</h2>
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
              <div className="when">
                {i === 0 ? `${formatDateLabel(date)} · ${formatHourRange(hour)}` : ''}
              </div>
              <div>
                <div>
                  {s.name}
                  {s.recurring && ' ↻'}
                  {s.walk_in && ' (walk-in)'}
                  {s.recurring_paused && <span className="paused-tag"> paused</span>}
                </div>
                {s.noShowHistory && s.noShowHistory.count > 0 && (
                  <div className="no-show-note">
                    ⚠ {s.noShowHistory.count} prior no-show{s.noShowHistory.count > 1 ? 's' : ''} ({s.noShowHistory.attended} attended)
                  </div>
                )}
              </div>
              <div style={{ color: 'var(--ink-secondary)', fontSize: 14 }}>
                {s.phone || ''}{s.phone && s.email ? ' · ' : ''}{s.email || ''}
                {s.checkedInAtFormatted && (
                  <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    ✓ Checked in {s.checkedInAtFormatted}
                  </div>
                )}
                {s.no_show && (
                  <div style={{ color: 'var(--red)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                    ⚠ NO-SHOW
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {s.recurring_paused && (
                  <button className="delete-btn" onClick={() => resumeRecurring(s.id)} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
                    Resume
                  </button>
                )}
                <button className="delete-btn" onClick={() => handleDelete(s.id)}>Remove</button>
              </div>
            </div>
          ));
        })}
      </div>

      {/* Coordinators */}
      <h2 className="admin-h2" style={{ marginTop: 36 }}>Alert recipients</h2>
      <p style={{ color: 'var(--ink-secondary)', fontSize: 15, margin: '0 0 12px' }}>
        These people receive an alert if no one has checked in 5 minutes into an hour. Phone for text (when Twilio is set up), email used now as fallback.
      </p>
      <CoordinatorList coordinators={data.coordinators} reload={() => load(sessionStorage.getItem('adminPw'))} />

      <button
        className="btn"
        style={{ marginTop: 32, maxWidth: 200 }}
        onClick={() => { sessionStorage.removeItem('adminPw'); setAuthed(false); setData(null); setPassword(''); }}
      >
        Sign out
      </button>
    </div>
  );
}

function CurrentHourPanel({ live }) {
  const allCheckedIn = live.checkedInCount > 0;
  const className = allCheckedIn ? 'live-panel ok' : 'live-panel warn';
  return (
    <div className={className}>
      <div className="live-label">RIGHT NOW · {formatHourRange(live.hour)}</div>
      {live.scheduled.length === 0 ? (
        <div className="live-message">⚠ No one scheduled for this hour</div>
      ) : allCheckedIn ? (
        <div className="live-message">
          ✓ {live.checkedInCount} of {live.scheduled.length} checked in
        </div>
      ) : (
        <div className="live-message">
          ⏳ Waiting for {live.scheduled.length} volunteer{live.scheduled.length > 1 ? 's' : ''} to arrive
        </div>
      )}
      <div className="live-names">
        {live.scheduled.map((s) => (
          <span key={s.id} className={`live-pill ${s.checked_in_at ? 'in' : 'pending'}`}>
            {s.checked_in_at ? '✓' : '⌛'} {s.name}
          </span>
        ))}
      </div>
    </div>
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
    await fetch('/api/admin', {
      method: 'PUT',
      headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, email }),
    });
    setName(''); setPhone(''); setEmail(''); setAdding(false);
    reload();
  }

  async function patch(coordinatorId, action) {
    const pw = sessionStorage.getItem('adminPw');
    await fetch('/api/admin', {
      method: 'PATCH',
      headers: { 'x-admin-password': pw, 'Content-Type': 'application/json' },
      body: JSON.stringify({ coordinatorId, action }),
    });
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
          <div className="field">
            <label>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>Phone (for SMS once enabled)</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+15551234567" />
          </div>
          <div className="field">
            <label>Email (for now)</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="btn-row">
            <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add</button>
          </div>
        </form>
      ) : (
        <button className="btn btn-primary" style={{ marginTop: 12, maxWidth: 240 }} onClick={() => setAdding(true)}>
          + Add coordinator
        </button>
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
