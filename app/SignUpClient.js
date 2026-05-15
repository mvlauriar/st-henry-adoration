'use client';
 
import { useState, useEffect } from 'react';
import {
  formatDateLabel,
  formatDateLabelEs,
  formatHourRange,
  todayInParish,
} from '../lib/dates';
 
export default function SignUpClient({ slots, slotsPerHour, initialCounts }) {
  const [counts, setCounts] = useState(initialCounts);
  const [openSlot, setOpenSlot] = useState(null);
  const today = todayInParish();
 
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
              {formatDateLabel(date)}
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
          onClose={() => setOpenSlot(null)}
          onSuccess={() => { refreshCounts(); }}
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
    if (!name.trim()) {
      setError('Please enter your name. · Por favor escriba su nombre.');
      return;
    }
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
          recurring,
          slot_date: slot.date,
          slot_hour: slot.hour,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong. Please try again. · Algo salió mal. Intente de nuevo.');
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
            {email && (
              <p>
                A reminder will be sent one hour before your time.<br/>
                <span className="success-es">Recibirá un recordatorio una hora antes.</span>
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
 
            <div className="field">
              <label htmlFor="name">Your name · Su nombre</label>
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
              <label htmlFor="phone">
                Phone number · Número de teléfono <span className="req">(required · requerido)</span>
              </label>
              <input
                id="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
 
            <div className="field">
              <label htmlFor="email">Email <span className="opt">(optional · opcional)</span></label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="for 1-hour reminder · para recordatorio"
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
                <span className="label-main label-es">Inscríbame a esta hora durante las próximas 4 semanas</span>
                <span className="label-sub">Cancel any week by contacting the parish office. · Cancele cualquier semana llamando a la parroquia.</span>
              </span>
            </label>
 
            {error && <div className="error-text">{error}</div>}
 
            <div className="btn-row">
              <button type="button" className="btn" onClick={onClose} disabled={submitting}>
                Cancel · Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Signing up… · Inscribiendo…' : 'Sign Up · Inscribirse'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
 
