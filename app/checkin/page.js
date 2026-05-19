'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatHourRange, formatDateLabelFull } from '../../lib/dates';

export default function CheckInPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWalkInForm, setShowWalkInForm] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/checkin', { cache: 'no-store' });
      const data = await res.json();
      setState(data);
      setError('');
    } catch (e) {
      setError('Connection lost. Retrying…');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + poll every 30 seconds
  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  async function checkIn(signupId, personName) {
    if (!confirm(`Check in ${personName}?`)) return;
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Could not check in.');
        return;
      }
      load(); // refresh state
    } catch (e) {
      alert('Connection error.');
    }
  }

  if (loading) {
    return <div className="ci-page ci-loading">Loading…</div>;
  }

  if (state?.outsideHours) {
    return (
      <div className="ci-page ci-outside">
        <div className="ci-ornament">✦ ✦ ✦</div>
        <h1>The chapel is closed.</h1>
        <p>Adoration hours: 8 AM – 8 PM daily.</p>
        <p className="ci-es">La capilla está cerrada. Horario: 8 AM – 8 PM.</p>
      </div>
    );
  }

  if (!state) {
    return <div className="ci-page ci-loading">{error || 'Loading…'}</div>;
  }

  const { currentHour, nextHour, currentHourSignups, nextHourSignups, isUncovered, walkInUnlocked, walkInUnlockMinutes, date } = state;

  return (
    <div className={`ci-page ${isUncovered ? 'ci-uncovered' : ''}`}>
      {isUncovered && (
        <div className="ci-alert-banner">
          <div className="ci-alert-line-1">⚠ No scheduled volunteer has arrived</div>
          <div className="ci-alert-line-2">If you can stay this hour, please check in below.</div>
          <div className="ci-alert-line-2 ci-es">Si puede quedarse esta hora, por favor regístrese abajo.</div>
        </div>
      )}

      <header className="ci-header">
        <div className="ci-date">{formatDateLabelFull(date)}</div>
        <h1 className="ci-hour">{formatHourRange(currentHour)}</h1>
      </header>

      <section className="ci-section">
        <h2 className="ci-section-title">
          Tap your name to check in
          <span className="ci-section-es">Toque su nombre para registrarse</span>
        </h2>

        {currentHourSignups.length === 0 ? (
          <div className="ci-empty">
            No one is scheduled for this hour.<br/>
            <span className="ci-es">Nadie está programado para esta hora.</span>
          </div>
        ) : (
          <div className="ci-tile-grid">
            {currentHourSignups.map((s) => (
              <button
                key={s.id}
                className={`ci-tile ${s.checkedInAt ? 'checked-in' : ''}`}
                onClick={() => !s.checkedInAt && checkIn(s.id, s.name)}
                disabled={!!s.checkedInAt}
              >
                <div className="ci-tile-name">{s.name}</div>
                <div className="ci-tile-phone">{s.phone}</div>
                <div className="ci-tile-status">
                  {s.checkedInAt
                    ? `✓ Checked in at ${s.checkedInAtFormatted}`
                    : 'Tap to check in · Toque para registrarse'}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {walkInUnlocked && (
        <section className="ci-walkin-section">
          {!showWalkInForm ? (
            <button className="ci-walkin-btn" onClick={() => setShowWalkInForm(true)}>
              Check in as walk-in
              <span className="ci-walkin-es">Registrarse como visitante</span>
            </button>
          ) : (
            <WalkInForm onCancel={() => setShowWalkInForm(false)} onSuccess={() => { setShowWalkInForm(false); load(); }} />
          )}
        </section>
      )}

      {!walkInUnlocked && (
        <p className="ci-waiting">
          Waiting for scheduled volunteers. Walk-in option available after {walkInUnlockMinutes} minutes if no one has arrived.
        </p>
      )}

      {nextHour !== null && nextHourSignups.length > 0 && (
        <section className="ci-next-hour">
          <h3>Next hour · Próxima hora — {formatHourRange(nextHour)}</h3>
          <div className="ci-next-list">
            {nextHourSignups.map((s) => (
              <div key={s.id} className="ci-next-item">
                <span>{s.name}</span>
                {s.checkedInAt && <span className="ci-next-checked">✓ Already here</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="ci-footer">
        St. Henry Adoration · Updated every 30 seconds
      </footer>
    </div>
  );
}

function WalkInForm({ onCancel, onSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your name. · Por favor escriba su nombre.'); return; }
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid phone number. · Número de teléfono válido requerido.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walkIn: true, name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not check in.');
        setSubmitting(false);
        return;
      }
      onSuccess();
    } catch {
      setError('Connection error.');
      setSubmitting(false);
    }
  }

  return (
    <form className="ci-walkin-form" onSubmit={submit}>
      <h3>Walk-in check-in · Registro de visitante</h3>
      <p className="ci-walkin-help">
        Thank you for staying with the Lord. · Gracias por quedarse con el Señor.
      </p>
      <div className="ci-field">
        <label>Name · Nombre</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
      </div>
      <div className="ci-field">
        <label>Phone · Teléfono</label>
        <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </div>
      {error && <div className="ci-error">{error}</div>}
      <div className="ci-walkin-actions">
        <button type="button" className="ci-btn-secondary" onClick={onCancel} disabled={submitting}>Cancel · Cancelar</button>
        <button type="submit" className="ci-btn-primary" disabled={submitting}>
          {submitting ? 'Checking in…' : 'Check in · Registrarse'}
        </button>
      </div>
    </form>
  );
}
