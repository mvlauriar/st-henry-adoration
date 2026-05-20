'use client';

import { useState, useEffect } from 'react';
import {
  formatDateLabel,
  formatDateLabelEs,
  formatHourRange,
  todayInParish,
} from '../lib/dates';

export default function SignUpClient({ slots, slotsPerHour, initialCounts, prefilledSlot, substituteMode }) {
  const [counts, setCounts] = useState(initialCounts);
  const [openSlot, setOpenSlot] = useState(null);
  const today = todayInParish();

  // Auto-open the prefilled slot once on mount (from substitute flow)
  useEffect(() => {
    if (prefilledSlot && prefilledSlot.date && Number.isInteger(prefilledSlot.hour)) {
      // Confirm this slot still has room before opening
      const filled = counts?.[prefilledSlot.date]?.[prefilledSlot.hour] || 0;
      if (filled < slotsPerHour) {
        setOpenSlot({ date: prefilledSlot.date, hour: prefilledSlot.hour });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshCounts() {
    try {
      const res = await fetch('/api/signup', { method: 'GET', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCounts(data.counts || {});
      }
    } catch (e) {}
  }

  return (
    <>
      {slots.map(({ date, hours }) => (
        <div key={date} className="day">
          <div className="day-header">
            <span>
              <span className="date-text">{formatDateLabel(date)}</span>
              <span className="day-header-es">{formatDateLabelEs(date)}</span>
            </span>
            {date === today && <span className="today">Today · Hoy</span>}
          </div>
          {hours.map((hour) => {
            const filled = counts?.[date]?.[hour] || 0;
            const isFull = filled >= slotsPerHour;
            const className = ['hour-row', isFull ? 'full' : ''].filter(Boolean).join(' ');

            return (
              <button
                key={hour}
                className={className}
                disabled={isFull}
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
                    {isFull ? 'Full · Lleno' : `${filled} of ${slotsPerHour}`}
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
          substituteMode={substituteMode}
          onClose={() => setOpenSlot(null)}
          onSuccess={() => { refreshCounts(); }}
        />
      )}
    </>
  );
}

function SignUpModal({ slot, substituteMode, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function isValidPhone(p) {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 10;
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your name. · Por favor escriba su nombre.'); return; }
    if (!isValidPhone(phone)) {
      setError('Please enter a valid phone number. · Por favor escriba un número de teléfono válido.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          recurring: substituteMode ? false : recurring, // substitutes don't auto-repeat
          slot_date: slot.date,
          slot_hour: slot.hour,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. · Algo salió mal.');
        setSubmitting(false);
        return;
      }
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError('Could not connect. · No se pudo conectar.');
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="success">
            <div className="seal">✦</div>
            <h3>Thank you · Gracias</h3>
            <p>You are signed up for · Inscrito para</p>
            <p className="success-when">
              {formatDateLabel(slot.date)} · {formatHourRange(slot.hour)}
            </p>
            {substituteMode && (
              <p style={{ background: 'var(--amber-bg)', padding: '12px 16px', borderRadius: 6, color: '#5e3e0a', fontStyle: 'italic' }}>
                Please go to the chapel and tap your name on the iPad to confirm your arrival.<br/>
                <span style={{ fontSize: 14 }}>Por favor vaya a la capilla y toque su nombre en el iPad para confirmar su llegada.</span>
              </p>
            )}
            {!substituteMode && email && (
              <p>
                A reminder will be sent one hour before your time.<br/>
                <span style={{ fontSize: 14, fontStyle: 'italic' }}>Recibirá un recordatorio una hora antes.</span>
              </p>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={onClose}>Close · Cerrar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h3>{formatDateLabel(slot.date)}</h3>
            <p className="modal-sub">{formatHourRange(slot.hour)}</p>

            {substituteMode && (
              <p style={{
                background: '#fef9ee',
                border: '1px solid #d4a945',
                padding: '12px 14px',
                borderRadius: 6,
                marginTop: 0,
                marginBottom: 18,
                fontSize: 15,
                color: '#5e3e0a',
                lineHeight: 1.4,
              }}>
                <strong>Substitute commitment:</strong> by signing up you commit to staying the <strong>full hour</strong>. The Blessed Sacrament cannot be left alone.
                <span style={{ display: 'block', marginTop: 6, fontStyle: 'italic', fontSize: 14 }}>
                  Compromiso: al inscribirse se compromete a quedarse la hora completa.
                </span>
              </p>
            )}

            <div className="field">
              <label htmlFor="name">Your name · Su nombre</label>
              <input id="name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
            </div>

            <div className="field">
              <label htmlFor="phone">
                Phone number · Número de teléfono <span className="req">(required · requerido)</span>
              </label>
              <input id="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>

            <div className="field">
              <label htmlFor="email">Email <span className="opt">(optional · opcional)</span></label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="for 1-hour reminder · para recordatorio" />
            </div>

            {!substituteMode && (
              <label className="checkbox-row">
                <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                <span>
                  <span className="label-main">Sign me up at this time for the next 4 weeks</span>
                  <span className="label-main label-es">Inscríbame a esta hora durante las próximas 4 semanas</span>
                  <span className="label-sub">Cancel any week by contacting the parish office. · Cancele cualquier semana llamando a la parroquia.</span>
                </span>
              </label>
            )}

            {error && <div className="error-text">{error}</div>}

            <div className="btn-row">
              <button type="button" className="btn" onClick={onClose} disabled={submitting}>Cancel · Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Signing up…' : (substituteMode ? 'Commit to this hour' : 'Sign Up · Inscribirse')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
