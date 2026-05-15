import { supabasePublic } from '../lib/supabase';
import { upcomingSlots, SLOTS_PER_HOUR } from '../lib/dates';
import SignUpClient from './SignUpClient';
 
export const dynamic = 'force-dynamic';
export const revalidate = 0;
 
async function getSlotCounts(slots) {
  if (slots.length === 0) return {};
  const firstDate = slots[0].date;
  const lastDate = slots[slots.length - 1].date;
  const { data, error } = await supabasePublic
    .from('slot_counts')
    .select('slot_date, slot_hour, filled')
    .gte('slot_date', firstDate)
    .lte('slot_date', lastDate);
 
  if (error) {
    console.error('Slot counts error:', error);
    return {};
  }
 
  const counts = {};
  for (const row of data || []) {
    if (!counts[row.slot_date]) counts[row.slot_date] = {};
    counts[row.slot_date][row.slot_hour] = row.filled;
  }
  return counts;
}
 
export default async function HomePage() {
  const slots = upcomingSlots(7);
  const counts = await getSlotCounts(slots);
 
  return (
    <div className="page">
      <header className="masthead">
        <div className="ornament">✦ ✦ ✦</div>
        <h1>St. Henry Adoration<br/>Sign Up</h1>
        <div className="parish">Guardians of the Sacred Chapel</div>
 
        <div className="hero-call">
          <p className="hero-en">Spend an hour with Jesus.<br/>He is waiting for you.</p>
          <p className="hero-es">Pasa una hora con Jesús.<br/>Él te espera.</p>
        </div>
 
        <hr />
      </header>
 
      <section className="guidelines">
        <h2>
          Guidelines for Guardians of the Sacred Chapel
          <span className="lang-es">Directrices para los Guardianes de la Capilla</span>
        </h2>
        <ul className="bilingual-list">
          <li>
            <span className="li-en">Arrive on time and ensure the Blessed Sacrament is never left unattended.</span>
            <span className="li-es">Llegue a tiempo y asegúrese de que el Santísimo Sacramento nunca quede sin compañía.</span>
          </li>
          <li>
            <span className="li-en">Maintain a spirit of reverence, silence and prayer.</span>
            <span className="li-es">Mantenga un espíritu de reverencia, silencio y oración.</span>
          </li>
          <li>
            <span className="li-en">If you are unable to attend, please arrange a substitute or notify here.</span>
            <span className="li-es">Si no puede asistir, por favor consiga un sustituto o avise aquí.</span>
          </li>
        </ul>
        <blockquote className="quote">
          Know also that you will probably gain more by praying fifteen minutes before the Blessed Sacrament than by all the other spiritual exercises of the day. True, Our Lord hears our prayers anywhere, for He has made the promise, &lsquo;Ask, and you shall receive&rsquo;, but He has revealed to His servants that those who visit Him in the Blessed Sacrament will obtain a more abundant measure of grace.
          <span className="attrib">— St. Alphonsus Liguori</span>
        </blockquote>
      </section>
 
      {slots.length === 0 ? (
        <p className="no-slots">
          No upcoming hours available. Please check back tomorrow.<br/>
          <span>No hay horas disponibles. Por favor regrese mañana.</span>
        </p>
      ) : (
        <SignUpClient
          slots={slots}
          slotsPerHour={SLOTS_PER_HOUR}
          initialCounts={counts}
        />
      )}
 
      <footer className="footer">
        May the Sacred Heart of Jesus be praised, adored, and loved.<br/>
        <span>Sea alabado, adorado y amado el Sagrado Corazón de Jesús.</span>
      </footer>
    </div>
  );
}
 
