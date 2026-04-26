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
      // Persist for the session so refresh isn't a hassle
      sessionStorage.setItem('adminPw', pw);
    } catch {
      setError('Network error.');
    }
    setLoading(false);
  }

  // Auto-login if we already have a password in this session
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

  // Group signups by date + hour for the list
  const byDateHour = {};
  for (const s of data.signups) {
    const key = `${s.slot_date}__${s.slot_hour}`;
    if (!byDateHour[key]) byDateHour[key] = [];
    byDateHour[key].push(s);
  }

  // Build a flat ordered list: every (date, hour) — empty hours included as flags
  const rows = [];
  for (const d of data.dates) {
    for (const h of data.hours) {
      const key = `${d}__${h}`;
      const list = byDateHour[key] || [];
      rows.push({ date: d, hour: h, list });
    }
  }

  return (
    <div className="page">
      <header className="masthead">
        <div className="ornament">✦</div>
        <h1 style={{ fontSize: 30 }}>Admin Dashboard</h1>
        <div className="parish">{data.empty.length} empty hour{data.empty.length === 1 ? '' : 's'} this week</div>
      </header>

      {/* Heatmap grid */}
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 500, fontSize: 24, margin: '8px 0' }}>
        Coverage at a glance
      </h2>
      <div className="admin-grid" style={{ gridTemplateColumns: `110px repeat(${data.hours.length}, 1fr)` }}>
        <div className="admin-cell header"></div>
        {data.hours.map((h) => (
          <div key={h} className="admin-cell header">{formatHourLabel(h).replace(':00 ', '')}</div>
        ))}
        {data.dates.map((d) => (
          <FragmentRow key={d} date={d} hours={data.hours} grid={data.grid} slotsPerHour={data.slotsPerHour} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 24px', flexWrap: 'wrap' }}>
        <Legend color="var(--red-bg)" textColor="var(--red)" label="Empty" />
        <Legend color="var(--amber-bg)" textColor="var(--gold)" label="Partial" />
        <Legend color="var(--green-bg)" textColor="var(--green)" label="Full" />
      </div>

      {/* Detailed list */}
      <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 500, fontSize: 24, margin: '24px 0 8px' }}>
        Upcoming signups
      </h2>
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
            <div key={s.id} className="admin-list-row">
              <div className="when">
                {i === 0 ? `${formatDateLabel(date)} · ${formatHourRange(hour)}` : ''}
              </div>
              <div>{s.name}{s.recurring && ' ↻'}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 14 }}>
                {s.phone || ''}{s.phone && s.email ? ' · ' : ''}{s.email || ''}
              </div>
              <button className="delete-btn" onClick={() => handleDelete(s.id)}>Remove</button>
            </div>
          ));
        })}
      </div>

      <button
        className="btn"
        style={{ marginTop: 24, maxWidth: 200 }}
        onClick={() => { sessionStorage.removeItem('adminPw'); setAuthed(false); setData(null); setPassword(''); }}
      >
        Sign out
      </button>
    </div>
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
