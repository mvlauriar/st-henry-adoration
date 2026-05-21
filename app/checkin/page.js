'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatHourRange, formatDateLabelFull } from '../../lib/dates';

const PARISH_PHONE = '(954) 785-2450';

export default function CheckInPage() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  async function checkIn(signupId, displayName) {
    if (!confirm(`Check in as ${displayName}?`)) return;
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId, action: 'checkin' }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not check in.'); return; }
      load();
    } catch (e) { alert('Connection error.'); }
  }

  async function checkOut(signupId, displayName) {
    if (!confirm(`Check out ${displayName}?`)) return;
    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signupId, action: 'checkout' }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Could not check out.'); return; }
      load();
    } catch (e) { alert('Connection error.'); }
  }

  if (loading) return <div className="ci-page ci-loading">Loading…</div>;

  if (state?.outsideHours) {
    return (
      <div className="ci-page ci-outside">
        <div className="ci-ornament">✦ ✦ ✦</div>
        <h1>The chapel is closed.</h1>
        <p>Adoration hours: 8 AM – 8 PM daily.</p>
        <p className="ci-es">La capilla está cerrada. Horario: 8 AM – 8 PM.</p>
        <ContactFooter />
      </div>
    );
  }

  if (!state) return <div className="ci-page ci-loading">{error || 'Loading…'}</div>;

  const { currentHour, nextHour, currentHourSignups, nextHourSignups, hourIsCovered, isUncovered, substituteUnlocked, date } = state;

  return (
    <div className={`ci-page ${isUncovered ? 'ci-uncovered' : ''}`}>
      <header className="ci-header">
        <div className="ci-date">{formatDateLabelFull(date)}</div>
        <h1 className="ci-hour">{formatHourRange(currentHour)}</h1>
        <div className={`ci-hour-status ${hourIsCovered ? 'covered' : 'uncovered'}`}>
          {hourIsCovered
            ? <>✓ Hour is covered <span className="ci-es-inline">· Hora cubierta</span></>
            : <>⌛ Waiting for volunteers <span className="ci-es-inline">· Esperando voluntarios</span></>
          }
        </div>
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
              <TileButton key={s.id} tile={s} onCheckIn={checkIn} onCheckOut={checkOut} />
            ))}
          </div>
        )}
      </section>

      {substituteUnlocked && (
        <section className="ci-substitute-section">
          <div className="ci-substitute-card">
            <h3>The chapel needs a substitute for this hour.</h3>
            <p className="ci-es">La capilla necesita un sustituto para esta hora.</p>
            <p className="ci-substitute-instructions">
              If you can stay for the <strong>full hour</strong>, please scan the QR code near the chapel door to register, then return here to check in.
            </p>
            <p className="ci-substitute-instructions ci-es">
              Si puede quedarse la <strong>hora completa</strong>, por favor escanee el código QR cerca de la puerta de la capilla para registrarse, y regrese aquí para registrar su llegada.
            </p>
            <p className="ci-substitute-reminder">
              The Blessed Sacrament cannot be left alone. · El Santísimo no puede quedar solo.
            </p>
          </div>
        </section>
      )}

      {nextHour !== null && nextHourSignups.length > 0 && (
        <section className="ci-next-hour-section">
          <div className="ci-next-divider">
            <span className="ci-next-divider-label">Next hour · {formatHourRange(nextHour)}</span>
          </div>
          <h2 className="ci-section-title">
            Arriving early? Tap your name
            <span className="ci-section-es">¿Llegando temprano? Toque su nombre</span>
          </h2>
          <div className="ci-tile-grid">
            {nextHourSignups.map((s) => (
              <TileButton key={s.id} tile={s} onCheckIn={checkIn} onCheckOut={checkOut} forHour={nextHour} />
            ))}
          </div>
        </section>
      )}

      <ContactFooter />
    </div>
  );
}

function TileButton({ tile, onCheckIn, onCheckOut, forHour }) {
  if (tile.isCheckedIn) {
    return (
      <button
        className="ci-tile checked-in"
        onClick={() => onCheckOut(tile.id, tile.displayName)}
      >
        <div className="ci-tile-name">{tile.displayName}</div>
        <div className="ci-tile-status">✓ Checked in</div>
        <div className="ci-tile-action">Tap to check out · Toque para salir</div>
      </button>
    );
  }
  if (tile.hasCheckedOut) {
    return (
      <button
        className="ci-tile checked-out"
        onClick={() => onCheckIn(tile.id, tile.displayName)}
      >
        <div className="ci-tile-name">{tile.displayName}</div>
        <div className="ci-tile-status">Checked out</div>
        <div className="ci-tile-action">Tap to return · Toque para regresar</div>
      </button>
    );
  }
  return (
    <button
      className="ci-tile"
      onClick={() => onCheckIn(tile.id, tile.displayName)}
    >
      <div className="ci-tile-name">{tile.displayName}</div>
      <div className="ci-tile-action">
        {forHour ? <>Tap to check in early<br/><span className="ci-tile-action-es">Toque para registrarse temprano</span></>
                 : <>Tap to check in<br/><span className="ci-tile-action-es">Toque para registrarse</span></>}
      </div>
    </button>
  );
}

function ContactFooter() {
  return (
    <footer className="ci-footer">
      <div className="ci-footer-contact">
        <strong>If you see anything that needs attention, or must leave before your replacement arrives:</strong><br/>
        Please call the parish office: <span className="ci-footer-phone">{PARISH_PHONE}</span>
      </div>
      <div className="ci-footer-contact ci-es">
        <strong>Si ve algo que necesita atención, o debe irse antes de que llegue su reemplazo:</strong><br/>
        Por favor llame a la oficina parroquial: <span className="ci-footer-phone">{PARISH_PHONE}</span>
      </div>
      <div className="ci-footer-meta">St. Henry Adoration · Updated every 30 seconds</div>
    </footer>
  );
}
