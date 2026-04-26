'use client';

import { useState, useEffect } from 'react';
import {
  formatDateLabel,
  formatHourRange,
  slotIsPast,
  todayInParish,
} from '../lib/dates';

export default function SignUpClient({ dates, hours, slotsPerHour, initialCounts }) {
  const [counts, setCounts] = useState(initialCounts);
  const [openSlot, setOpenSlot] = useState(null); // { date, hour }
  const today = todayInParish();

  // Refresh counts after a successful signup so dots update without a full reload
  async function refreshCounts() {
    try {
      const res = await fetch('/api/signup', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
      }
    } catch (e) {
      // ignore — page will refresh on next visit
    }
  }

  return (
    <>
      {dates.map((date) => (
        <div key={date} className="day">
          <div className="day-header">
            <span>{formatDateLabel(date)}</span>
            {date === today && <span className="today">Today</span>}
          </div>
          {hours.map((hour) => {
            const filled = counts?.[date]?.[hour] || 0;
            const isPast = slotIsPast(date, hour);
            const isFull = filled >= slotsPerHour;
            const disabled = isPast || isFull;
            const className = [
              'hour-row',
              isFull ? 'full' : '',
              isPast ? 'past' : '',
            ].filter(Boolean).join(' ');

            return (
              <button
                key={hour}
                className={className}
                disabled={disabled}
                onClick={() => setOpenSlot({ date, hour })}
              >
                <span className="time">{formatHourRange(hour)}</span>
                <span className="status">
                  <span className="dots" aria-hidden="true">
                    {Array.from({ length: slotsPerHour }, (_, i) => (
                      <span key={i} className={`dot ${i < filled ? 'filled' : ''}`} />
                    ))}
                  </span>
                  <span>
                    {isPast
                      ? 'past'
                      : isFull
                      ? 'Full'
                      : `${filled} of ${slotsPerHour}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ))}

      {openSlot && (
        <SignUpModal
          slot={openSlot}
          onClose={() => setOpenSlot(null)}
          onSuccess={() => {
            refreshCounts();
          }}
        />
      )}
    </>
  );
}

function SignUpModal({ slot, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  // Lock body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          recurring,
          slot_date: slot.date,
          slot_hour: slot.hour,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError('Could not connect. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="success">
            <div className="seal">✦</div>
            <h3>Thank you</h3>
            <p>You are signed up for</p>
            <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: 'var(--burgundy)', margin: '8px 0 16px' }}>
              {formatDateLabel(slot.date)} · {formatHourRange(slot.hour)}
            </p>
            {email && <p>A reminder will be sent one hour before your time.</p>}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3>{formatDateLabel(slot.date)}</h3>
            <p className="modal-sub">{formatHourRange(slot.hour)}</p>

            <div className="field">
              <label htmlFor="name">Your name</label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label htmlFor="phone">Phone number</label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(optional)"
              />
            </div>

            <div className="field">
              <label htmlFor="email">Email (for reminder)</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="(optional, for 1-hour reminder)"
              />
            </div>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
              />
              <span>
                <span className="label-main">Sign me up at this time for the next 4 weeks</span>
                <span className="label-sub">You can cancel any individual week by contacting the parish office.</span>
              </span>
            </label>

            {error && <div className="error-text">{error}</div>}

            <div className="btn-row">
              <button type="button" className="btn" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Signing up…' : 'Sign Up'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
