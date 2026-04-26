import { supabasePublic } from '../lib/supabase';
import { upcomingDates, HOURS, SLOTS_PER_HOUR } from '../lib/dates';
import SignUpClient from './SignUpClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function getSlotCounts() {
  const dates = upcomingDates(7);
  const { data, error } = await supabasePublic
    .from('slot_counts')
    .select('slot_date, slot_hour, filled')
    .gte('slot_date', dates[0])
    .lte('slot_date', dates[dates.length - 1]);

  if (error) {
    console.error('Slot counts error:', error);
    return {};
  }

  // Build a lookup: counts[date][hour] = filled
  const counts = {};
  for (const row of data || []) {
    if (!counts[row.slot_date]) counts[row.slot_date] = {};
    counts[row.slot_date][row.slot_hour] = row.filled;
  }
  return counts;
}

export default async function HomePage() {
  const counts = await getSlotCounts();
  const dates = upcomingDates(7);

  return (
    <div className="page">
      <header className="masthead">
        <div className="ornament">✦ ✦ ✦</div>
        <h1>St. Henry Adoration<br/>Sign Up</h1>
        <div className="parish">Guardians of the Sacred Chapel</div>
        <hr />
      </header>

      <section className="guidelines">
        <h2>Guidelines for Guardians of the Sacred Chapel</h2>
        <ul>
          <li>Arrive on time and ensure the Blessed Sacrament is never left unattended.</li>
          <li>Maintain a spirit of reverence, silence and prayer.</li>
          <li>If you are unable to attend your scheduled time, please arrange for a substitute or notify here.</li>
        </ul>
        <blockquote className="quote">
          Know also that you will probably gain more by praying fifteen minutes before the Blessed Sacrament than by all the other spiritual exercises of the day. True, Our Lord hears our prayers anywhere, for He has made the promise, &lsquo;Ask, and you shall receive&rsquo;, but He has revealed to His servants that those who visit Him in the Blessed Sacrament will obtain a more abundant measure of grace.
          <span className="attrib">— St. Alphonsus Liguori</span>
        </blockquote>
      </section>

      <SignUpClient
        dates={dates}
        hours={HOURS}
        slotsPerHour={SLOTS_PER_HOUR}
        initialCounts={counts}
      />

      <footer className="footer">
        May the Sacred Heart of Jesus be praised, adored, and loved.
      </footer>
    </div>
  );
}
