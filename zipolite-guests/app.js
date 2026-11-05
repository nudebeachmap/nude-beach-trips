
/**
 * Nude Beach Trips - Zipolite 2027 Guest Portal
 * Complete app.js
 * Supabase login, guest preferences and itinerary
 */

const CONFIG = window.ZIPOLITE_CONFIG || {};

const TOUR_DATA = [
  {
    id: 'mangroves',
    name: 'Mangroves & Turtle Release',
    emoji: '🐢',
    price: 1400,
    time: '6:30–10:00 AM',
    desc: 'A beautiful non-motorized boat trip through the mangroves, wildlife spotting and a turtle-release experience where conditions allow.'
  },
  {
    id: 'marine',
    name: 'Marine Safari & Sunrise',
    emoji: '🐬',
    price: 1000,
    time: '6:30–10:00 AM',
    desc: 'Boat trip in search of marine wildlife, visits to secluded beaches and snorkelling (equipment included).'
  },
  {
    id: 'bio',
    name: 'Bioluminescence Lagoon',
    emoji: '✨',
    price: 1600,
    time: '5:00–11:30 PM',
    desc: 'An evening at the glowing lagoon, with the opportunity to swim. An optional dinner stop is at your own expense.'
  },
  {
    id: 'falls',
    name: 'Magical Waterfalls Hike',
    emoji: '🌿',
    price: 2500,
    time: '6:00 AM–2:00 PM',
    desc: 'Jungle trails, waterfalls, mountain pools and buffet breakfast with the local guide.'
  }
];

const MEZCAL_PRICE = 1400;
const RATE = 0.053129; // Indicative MXN to USD, Nov 3 2026
const DEADLINE = 'December 15, 2026';

const STARTERS = [
  'Lobster bisque',
  'Cream of shrimp soup',
  'Cream of mushroom soup'
];

const MAINS = [
  'Camarones Revueltos',
  'Pad Thai',
  'Salmon',
  'Pulpo Atropellado'
];

const PAD = ['Chicken', 'Shrimp', 'Vegan'];

const DESSERTS = [
  'Tempura ice cream',
  'Coffee flan'
];

const DRINKS = [
  'Glass of white wine',
  'Glass of red wine',
  'Agua fresca (fresh fruit drink)'
];

const STEPS = [
  'Your booking',
  'Arrival',
  'Your days',
  'Welcome dinner',
  'Review & send'
];

let booking = {
  lead_name: '',
  email: '',
  booking_ref: 'DEMO',
  guest_count: 2
};

let activeStep = 0;
let isLoading = false;
let isSaving = false;
let hasSubmitted = false;
let error = '';

let guestSession = null;

try {
  guestSession = JSON.parse(
    sessionStorage.getItem('nbt_guest_session') || 'null'
  );
} catch {
  guestSession = null;
}

let guestJWT = guestSession?.access_token || '';
let guestEmail = guestSession?.email || '';
let signInEmail = '';
let loginStage = 'login';
let matchedBookings = [];
let selectedBookingId = '';

const AUTH_BASE =
  (CONFIG.supabaseUrl || '').replace(/\/$/, '') +
  '/auth/v1';

const API =
  (CONFIG.supabaseUrl || '').replace(/\/$/, '') +
  '/functions/v1/zipolite-guest';

const authHeaders = () => ({
  apikey: CONFIG.publishableKey,
  'content-type': 'application/json'
});

const escapeHTML = x =>
  String(x ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const mx = n =>
  `MXN $${Number(n).toLocaleString('en-US')}`;

const usd = n =>
  `≈ USD $${Math.round(n * RATE).toLocaleString('en-US')}`;

const displayMain = n =>
  n === 'Camarones Revueltos'
    ? 'Shrimp (Camarones Revueltos)'
    : n === 'Pulpo Atropellado'
    ? 'Grilled Octopus (Pulpo Atropellado)'
    : n;

const deadlinePassed = () =>
  Date.now() > Date.parse('2026-12-16T05:59:59.999Z');

const cleanPhone = x =>
  String(x || '').replace(/[\s().-]/g, '');

const validPhone = x =>
  /^\+[1-9]\d{6,14}$/.test(cleanPhone(x));

const nameFor = i =>
  state.guests[i]?.name.trim().split(' ')[0] ||
  `Guest ${i + 1}`;

const tourCount = id =>
  (state.tourGuests[id] || []).length;

const blankGuest = (name = '') => ({
  name,
  starter: '',
  main: '',
  pad: '',
  dessert: '',
  drink: '',
  allergies: '',
  whatsapp: 'email',
  whatsappPhone: ''
});

// --------------------------------------------------
// FORM STATE
// --------------------------------------------------

function freshState(n) {
  return {
    guests: Array.from(
      { length: n },
      () => blankGuest()
    ),

    arrival: {
      status: 'booked',
      airport: 'HUX',
      arrival_date: '',
      flight_number: '',
      arrival_time: '',
      transfer: 'unsure',
      notes: ''
    },

    tourGuests: {
      mangroves: [],
      marine: [],
      bio: [],
      falls: []
    },

    mezcalGuests: [],
    mezcalMaybe: [],

    massageGuests: [],
    massageMaybe: [],

    farewellGuests: [],
    farewellMaybe: [],

    notes: '',
    confirmed: false
  };
}

let state = freshState(2);

function normalizeState(saved, n) {
  const p =
    saved && typeof saved === 'object'
      ? saved
      : freshState(n);

  p.guests = Array.from(
    { length: n },
    (_, i) => ({
      ...blankGuest(),
      ...(p.guests?.[i] || {})
    })
  );

  p.arrival = {
    ...freshState(n).arrival,
    ...(p.arrival || {})
  };

  p.tourGuests = {
    ...freshState(n).tourGuests,
    ...(p.tourGuests || {})
  };

  for (const k of [
    'mezcalGuests',
    'mezcalMaybe',
    'massageGuests',
    'massageMaybe',
    'farewellGuests',
    'farewellMaybe'
  ]) {
    if (!Array.isArray(p[k])) {
      p[k] = [];
    }
  }

  if (
    p.whatsapp &&
    ['announcements', 'social'].includes(p.whatsapp) &&
    p.guests[0].whatsapp === 'email'
  ) {
    p.guests[0].whatsapp = p.whatsapp;
    p.guests[0].whatsappPhone =
      p.whatsappPhone || '';
  }

  delete p.whatsapp;
  delete p.whatsappPhone;

  return p;
}

// --------------------------------------------------
// AUTHENTICATION
// --------------------------------------------------

function storeSession(result, email) {
  guestSession = {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_at:
      Math.floor(Date.now() / 1000) +
      (Number(result.expires_in) || 3600),
    email:
      email ||
      result.user?.email ||
      guestEmail
  };

  guestJWT = guestSession.access_token;
  guestEmail = guestSession.email;

  sessionStorage.setItem(
    'nbt_guest_session',
    JSON.stringify(guestSession)
  );
}

function forgetSession() {
  guestSession = null;
  guestJWT = '';
  guestEmail = '';
  selectedBookingId = '';
  matchedBookings = [];

  sessionStorage.removeItem('nbt_guest_session');
  sessionStorage.removeItem('nbt_guest_jwt');
  sessionStorage.removeItem('nbt_guest_email');
}

async function getValidJWT() {
  if (!guestSession?.access_token) {
    throw Error('Please sign in again.');
  }

  if (
    guestSession.expires_at &&
    Date.now() / 1000 < guestSession.expires_at - 45
  ) {
    return guestSession.access_token;
  }

  if (!guestSession.refresh_token) {
    throw Error(
      'Your session expired. Please sign in again.'
    );
  }

  const r = await fetch(
    `${AUTH_BASE}/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        refresh_token: guestSession.refresh_token
      })
    }
  );

  const j = await r.json().catch(() => ({}));

  if (!r.ok || !j.access_token) {
    forgetSession();
    throw Error(
      'Your session expired. Please sign in again.'
    );
  }

  storeSession(j, guestEmail);
  return guestJWT;
}

async function authRequest(path, body) {
  const r = await fetch(AUTH_BASE + path, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw Error(
      j.error_description ||
      j.msg ||
      j.message ||
      j.error ||
      `Authentication error (HTTP ${r.status}).`
    );
  }

  return j;
}

async function guestApi(method = 'GET', body = null) {
  const jwt = await getValidJWT();

  const r = await fetch(API, {
    method,
    headers: {
      authorization: `Bearer ${jwt}`,
      apikey: CONFIG.publishableKey,
      'content-type': 'application/json'
    },
    ...(body
      ? { body: JSON.stringify(body) }
      : {})
  });

  const j = await r.json().catch(() => ({}));

  if (!r.ok) {
    if (r.status === 401) {
      forgetSession();
    }

    throw Error(
      j.error ||
      `Unable to load booking (HTTP ${r.status}).`
    );
  }

  return j;
}

// --------------------------------------------------
// BRANDING
// --------------------------------------------------

function topbar() {
  return `
    <header class="topbar">
      <a
        class="brand"
        href="https://www.nudebeachtrips.com/"
        target="_blank"
        rel="noopener"
      >
        <img
          class="nbm-logo"
          src="https://www.nudebeachtrips.com/assets/nude-beach-map-logo.gif"
          alt="Nude Beach Map logo"
        >

        <span class="brand-word">
          NUDE BEACH TRIPS
          <small>BY NUDE BEACH MAP</small>
        </span>
      </a>

      <div class="top-right">
        <span class="top-message">
          ZIPOLITE 2027 · GUEST PREFERENCES
        </span>

        <span class="private-pill">
          <span class="dot"></span>
          GUEST PORTAL
        </span>

        ${
          guestJWT
            ? '<button type="button" class="signout-link" data-guest-signout>Sign out</button>'
            : ''
        }
      </div>
    </header>
  `;
}

function hero() {
  return `
    <section class="hero">
      <span class="hero-sun"></span>

      <div class="container">
        <div class="hero-brandline">
          <span class="hero-brandname">
            NUDE BEACH TRIPS
          </span>

          <span class="hero-brand-divider"></span>
          <span>ZIPOLITE TAKEOVER 2027</span>
        </div>

        <div class="eyebrow">
          YOUR JANUARY GETAWAY
        </div>

        <h1>
          Your days in <em>paradise.</em>
        </h1>

        <p class="hero-intro">
          Four nights at Buda Mar, with a packed menu
          of optional adventures. Choose for everyone
          in your booking.
        </p>

        <div class="hero-meta">
          <span>📍 Buda Mar, Zipolite</span>
          <span>📅 Jan 24–28, 2027</span>
          <span>⏳ Reply by Dec 15</span>
        </div>
      </div>
    </section>
  `;
}

function stepper() {
  return `
    <nav class="stepper" aria-label="Form steps">
      ${STEPS.map((s, i) => `
        <button
          type="button"
          class="step ${
            i === activeStep
              ? 'active'
              : i < activeStep
              ? 'done'
              : ''
          }"
          data-go="${i}"
          ${isSaving ? 'disabled' : ''}
        >
          <span class="number">
            ${i < activeStep ? '✓' : i + 1}
          </span>

          <span class="step-label">
            ${s}
          </span>
        </button>
      `).join('')}
    </nav>
  `;
}

// --------------------------------------------------
// FIELD COMPONENTS
// --------------------------------------------------

function field(
  title,
  value,
  key,
  type = 'text',
  placeholder = '',
  extra = ''
) {
  return `
    <div class="field">
      <label for="${key}">
        ${title}
      </label>

      <input
        id="${key}"
        data-field="${key}"
        type="${type}"
        placeholder="${escapeHTML(placeholder)}"
        value="${escapeHTML(value)}"
        ${extra}
      >
    </div>
  `;
}

function select(title, value, key, opts) {
  return `
    <div class="field">
      <label for="${key}">
        ${title}
      </label>

      <select
        id="${key}"
        data-field="${key}"
      >
        ${opts.map(([v, t]) => `
          <option
            value="${escapeHTML(v)}"
            ${v === value ? 'selected' : ''}
          >
            ${escapeHTML(t)}
          </option>
        `).join('')}
      </select>
    </div>
  `;
}

function textarea(title, value, key, placeholder) {
  return `
    <div class="field">
      <label for="${key}">
        ${title}
      </label>

      <textarea
        id="${key}"
        data-field="${key}"
        placeholder="${escapeHTML(placeholder)}"
      >${escapeHTML(value)}</textarea>
    </div>
  `;
}

// --------------------------------------------------
// STEP 1 — GUEST LIST
// --------------------------------------------------

function bookingStep() {
  return `
    <div class="section-eyebrow">
      STEP 01 / 05 · THE GUEST LIST
    </div>

    <h2 class="section-title">
      Who's coming along?
    </h2>

    <p class="section-subtitle">
      Just one form per booking.
      You can select activities and dinner choices
      separately for each guest.
    </p>

    <div class="field-grid">
      <div class="field">
        <label>Lead guest</label>

        <input
          type="text"
          value="${escapeHTML(booking.lead_name)}"
          disabled
        >
      </div>

      <div class="field">
        <label>Booking email</label>

        <input
          type="email"
          value="${escapeHTML(booking.email)}"
          disabled
        >
      </div>
    </div>

    <div
      class="section-eyebrow"
      style="margin-top:14px"
    >
      YOUR ${state.guests.length}
      GUEST${state.guests.length === 1 ? '' : 'S'}
    </div>

    ${state.guests.map((g, i) => `
      <div class="guest-row">
        <div class="guest-avatar">
          ${i + 1}
        </div>

        <input
          data-guest-name="${i}"
          aria-label="Guest ${i + 1} full name"
          maxlength="120"
          placeholder="Guest ${i + 1}: first and last name"
          value="${escapeHTML(g.name)}"
        >
      </div>
    `).join('')}

    <p
      class="step-description"
      style="margin-top:14px"
    >
      If the number of guests on your booking is
      incorrect, please contact us instead of
      completing another form.
    </p>
  `;
}

// --------------------------------------------------
// STEP 2 — ARRIVAL
// --------------------------------------------------

function arrivalStep() {
  const a = state.arrival;

  return `
    <div class="section-eyebrow">
      STEP 02 / 05 · ARRIVAL
    </div>

    <h2 class="section-title">
      Getting to Zipolite.
    </h2>

    <p class="section-subtitle">
      Share your arrival details so we know when
      to expect you. Airport transfers can be
      arranged on request.
    </p>

    <div class="field">
      <label class="field-label">
        Your travel plans
      </label>

      <div class="seg-box">
        ${[
          ['booked', 'Flights booked'],
          ['not_booked', 'Still planning'],
          ['not_flying', 'Arriving another way']
        ].map(([v, t]) => `
          <button
            type="button"
            class="segment ${
              a.status === v ? 'active' : ''
            }"
            data-status="${v}"
          >
            ${t}
          </button>
        `).join('')}
      </div>
    </div>

    ${
      a.status === 'booked'
        ? `
          <div class="field-grid">
            ${select(
              'Arrival airport',
              a.airport,
              'arrival.airport',
              [
                ['HUX', 'Huatulco (HUX)'],
                ['PXM', 'Puerto Escondido (PXM)'],
                ['other', 'Other']
              ]
            )}

            ${field(
              'Arrival date',
              a.arrival_date,
              'arrival.arrival_date',
              'date',
              '',
              'min="2027-01-01" max="2027-02-15"'
            )}

            ${field(
              'Flight number',
              a.flight_number,
              'arrival.flight_number',
              'text',
              'e.g. AM 123'
            )}

            ${field(
              'Scheduled landing time (local)',
              a.arrival_time,
              'arrival.arrival_time',
              'time'
            )}
          </div>
        `
        : a.status === 'not_booked'
        ? `
          <div class="notice warm">
            You can return to add your flight details
            before ${DEADLINE}.
          </div>
        `
        : `
          <div class="notice">
            No flight details required for arrivals by road.
          </div>
        `
    }

    <h3
      class="section-title"
      style="font-size:22px;margin-top:13px"
    >
      Airport transfers
    </h3>

    <p
      class="section-subtitle"
      style="margin-bottom:14px"
    >
      Want help arranging transport to Buda Mar?
      We can coordinate options and give you the price
      before you decide. You can also book your own ride.
    </p>

    <div class="seg-box">
      ${[
        ['yes', 'Please arrange'],
        ['no', 'I’ll arrange my own'],
        ['unsure', 'Not sure yet']
      ].map(([v, t]) => `
        <button
          type="button"
          class="segment ${
            a.transfer === v ? 'active' : ''
          }"
          data-transfer="${v}"
        >
          ${t}
        </button>
      `).join('')}
    </div>

    ${
      a.transfer === 'yes'
        ? `
          <div class="notice">
            🚐 We’ll follow up with available
            transfer options and costs.
            This is a request, not a paid booking.
          </div>
        `
        : ''
    }

    <div style="margin-top:19px">
      ${textarea(
        'Anything helpful about your arrival? (optional)',
        a.notes,
        'arrival.notes',
        'Other flight information, separate arrivals, etc.'
      )}
    </div>
  `;
}

// --------------------------------------------------
// ACTIVITY SELECTIONS
// --------------------------------------------------

function picker(type, chosen) {
  return `
    <div class="pills">
      ${state.guests.map((_, i) => `
        <button
          class="pill ${
            chosen.includes(i) ? 'selected' : ''
          }"
          type="button"
          data-toggle="${type}"
          data-person="${i}"
          aria-pressed="${chosen.includes(i)}"
        >
          <span class="tick">
            ${chosen.includes(i) ? '✓' : ''}
          </span>

          ${escapeHTML(nameFor(i))}
        </button>
      `).join('')}
    </div>
  `;
}

function maybeButtons(type) {
  const yes = state[type + 'Guests'] || [];
  const maybe = state[type + 'Maybe'] || [];

  return `
    <div class="choice-label">
      Who's interested?
    </div>

    ${picker(type, yes)}

    <p class="step-description">
      Tap a guest name to show interest,
      or choose Maybe below.
    </p>

    <div class="pills" style="margin-top:9px">
      ${state.guests.map((_, i) => `
        <button
          class="pill ${
            maybe.includes(i) ? 'selected' : ''
          }"
          type="button"
          data-maybe="${type}"
          data-person="${i}"
          aria-pressed="${maybe.includes(i)}"
        >
          ${maybe.includes(i) ? '✓ ' : ''}
          ${escapeHTML(nameFor(i))} · Maybe
        </button>
      `).join('')}
    </div>
  `;
}

function activityCard(t) {
  const c = tourCount(t.id);

  return `
    <article class="activity">
      <span class="activity-icon">
        ${t.emoji}
      </span>

      <div class="activity-content">
        <div class="activity-topline">
          <div>
            <div class="activity-title">
              ${t.name}
            </div>

            <div class="activity-time">
              ${t.time}
            </div>
          </div>

          <span class="tag paid">
            OPTIONAL · PAID
          </span>
        </div>

        <p class="activity-desc">
          ${t.desc}
        </p>

        <div class="activity-price">
          <b>${mx(t.price)}</b>
          <small>
            / person · ${usd(t.price)}
          </small>
        </div>

        <div class="choice-label">
          Who's interested?
        </div>

        ${picker(
          t.id,
          state.tourGuests[t.id]
        )}

        ${
          c
            ? `
              <div class="mini-calc">
                ${c} guest${c === 1 ? '' : 's'}
                interested ·
                ${mx(t.price * c)}
                (${usd(t.price * c)}),
                paid in cash directly to this
                tour operator.
              </div>
            `
            : ''
        }
      </div>
    </article>
  `;
}

function activityPlain(
  icon,
  time,
  title,
  desc,
  badge = 'Included'
) {
  return `
    <article class="activity">
      <span class="activity-icon">
        ${icon}
      </span>

      <div class="activity-content">
        <div class="activity-topline">
          <div>
            <div class="activity-title">
              ${title}
            </div>

            <div class="activity-time">
              ${time}
            </div>
          </div>

          <span class="tag ${
            badge === 'Included'
              ? 'included'
              : 'tbc'
          }">
            ${badge.toUpperCase()}
          </span>
        </div>

        <p class="activity-desc">
          ${desc}
        </p>
      </div>
    </article>
  `;
}

function day(
  date,
  abbr,
  title,
  desc,
  activities
) {
  return `
    <section class="day">
      <div class="day-header">
        <div class="date-square">
          <b>${date}</b>
          <span>JAN · ${abbr}</span>
        </div>

        <div>
          <h3>${title}</h3>
          <p>${desc}</p>
        </div>
      </div>

      <div class="activities">
        ${activities.join('')}
      </div>
    </section>
  `;
}

// --------------------------------------------------
// GOTA GORDA MEZCAL TASTING
// --------------------------------------------------

function mezcalCard() {
  const c = state.mezcalGuests.length;

  return `
    <article class="activity">
      <span class="activity-icon">🥃</span>

      <div class="activity-content">
        <div class="activity-topline">
          <div>
            <div class="activity-title">
              Private Mezcal Tasting with
              Gota Gorda Mezcalería
            </div>

            <div class="activity-time">
              7:30 PM · At Buda Mar ·
              Monday, January 25
            </div>
          </div>

          <span class="tag paid">
            SPECIAL EXPERIENCE · PAID
          </span>
        </div>

        <p class="activity-desc">
          One of Zipolite’s best-loved mezcalerías
          is coming to us! Join the celebrated
          Gota Gorda Mezcalería team for a
          personalized tasting at our hotel.

          Discover the extraordinary world of
          Oaxacan mezcal through small-batch
          artisanal and ancestral agave spirits,
          learn about traditional production and
          the people behind each bottle, and
          explore how different agaves create
          completely different flavours.

          A brilliant way to spend an evening
          in Zipolite, whether you're new to
          mezcal or already a fan.
          Bottles may be available to purchase
          separately.
        </p>

        <div class="activity-price">
          <b>${mx(MEZCAL_PRICE)}</b>

          <small>
            / person · ${usd(MEZCAL_PRICE)}
          </small>
        </div>

        ${maybeButtons('mezcal')}

        ${
          c
            ? `
              <div class="mini-calc">
                ${c} guest${c === 1 ? '' : 's'}
                interested ·
                ${mx(c * MEZCAL_PRICE)}
                (${usd(c * MEZCAL_PRICE)}).

                Payment details will be
                confirmed separately.
              </div>
            `
            : ''
        }
      </div>
    </article>
  `;
}

// --------------------------------------------------
// FAREWELL DINNER — NEW
// --------------------------------------------------

function farewellCard() {
  return `
    <article class="activity">
      <span class="activity-icon">🌅</span>

      <div class="activity-content">
        <div class="activity-topline">
          <div>
            <div class="activity-title">
              Farewell Dinner with Your Hosts
            </div>

            <div class="activity-time">
              Wednesday, January 27 ·
              Evening · Time and venue TBC
            </div>
          </div>

          <span class="tag tbc">
            DETAILS TBC
          </span>
        </div>

        <p class="activity-desc">
          Join us for one final dinner together
          in Zipolite!

          A chance to share stories, enjoy good
          food and toast an unforgettable few days.

          We're checking options and would love to
          know who'd like to come.

          Venue, menu, time and price are to be
          confirmed. This is an expression of
          interest, not a reservation.
        </p>

        ${maybeButtons('farewell')}
      </div>
    </article>
  `;
}

// --------------------------------------------------
// HOTEL MASSAGES
// --------------------------------------------------

function massageCard() {
  return `
    <section
      class="day"
      style="margin-top:18px"
    >
      <div class="day-header">
        <div
          class="date-square"
          style="background:#faefde;color:#a16b39"
        >
          <b style="font-size:23px">
            💆
          </b>

          <span>ANY DAY</span>
        </div>

        <div>
          <h3>Fancy a hotel massage?</h3>
          <p>Optional little luxuries</p>
        </div>
      </div>

      <div class="activities">
        <article class="activity">
          <span class="activity-icon">
            🌺
          </span>

          <div class="activity-content">
            <div class="activity-topline">
              <div>
                <div class="activity-title">
                  Massage at Buda Mar
                </div>

                <div class="activity-time">
                  Available at the hotel ·
                  Timing and availability TBC
                </div>
              </div>

              <span class="tag paid">
                EXTRA · PRICE TBC
              </span>
            </div>

            <p class="activity-desc">
              Interested in treating yourself?
              Let us know who might like a massage
              and we'll pass on details as they
              become available. Bookings and
              payment are directly with the hotel.
            </p>

            ${maybeButtons('massage')}
          </div>
        </article>
      </div>
    </section>
  `;
}

// --------------------------------------------------
// STEP 3 — ITINERARY
// --------------------------------------------------

function itineraryStep() {
  return `
    <div class="section-eyebrow">
      STEP 03 / 05 · MAKE IT YOURS
    </div>

    <h2 class="section-title">
      Five sun-kissed days.
    </h2>

    <p class="section-subtitle">
      Check out what's planned and select the
      guests interested in each optional activity.
    </p>

    <div class="notice warm">
      💸 <b>Important:</b>
      Optional tours run <b>on demand</b>,
      subject to guest interest, operator
      availability and conditions.

      <b>
        Each excursion is paid separately in cash
        (Mexican pesos), directly to its operator.
      </b>

      USD amounts are estimates.
    </div>

    <div class="days">

      ${day(
        24,
        'SUN',
        'Welcome to paradise',
        'Sunday · Check-in day',
        [
          activityPlain(
            '🏨',
            'From 3:00 PM',
            'Check-in at Buda Mar',
            'Settle in, find your spot by the pool and enjoy Zipolite.'
          ),

          activityPlain(
            '🍽️',
            '7:00 PM',
            'Welcome dinner',
            'A special dinner at Buda Mar, included for every guest. Your menu choices are in the next step.'
          )
        ]
      )}

      ${day(
        25,
        'MON',
        'Mangroves & hidden coves',
        'Monday · Coastal discoveries',
        [
          activityCard(TOUR_DATA[0]),

          activityPlain(
            '🏝️',
            '4:00 PM',
            'Playa del Amor group walk',
            'A relaxed walk to the famous clothing-optional cove.'
          ),

          mezcalCard()
        ]
      )}

      ${day(
        26,
        'TUE',
        'Wildlife & glowing water',
        'Tuesday · Two optional adventures',
        [
          activityCard(TOUR_DATA[1]),
          activityCard(TOUR_DATA[2])
        ]
      )}

      ${day(
        27,
        'WED',
        'Waterfalls & farewell',
        'Wednesday · One last full day',
        [
          activityCard(TOUR_DATA[3]),
          farewellCard()
        ]
      )}

      ${day(
        28,
        'THU',
        'See you next time!',
        'Thursday · Departure',
        [
          activityPlain(
            '🧳',
            'By 12:00 PM',
            'Hotel check-out',
            'Enjoy a final coffee, dip or beach stroll before heading off.'
          )
        ]
      )}

    </div>

    ${massageCard()}

    <p class="itinerary-endnote">
      Beach yoga and beach games may be offered
      throughout the stay; details will be
      shared closer to departure.
    </p>
  `;
}

// --------------------------------------------------
// STEP 4 — DINNER SELECTIONS
// --------------------------------------------------

function radios(value, options, key, i) {
  return `
    <div class="course-options">
      ${options.map(v => `
        <label class="course-option ${
          value === v ? 'chosen' : ''
        }">
          <input
            type="radio"
            name="${key}-${i}"
            data-meal="${key}"
            data-guest="${i}"
            value="${escapeHTML(v)}"
            ${value === v ? 'checked' : ''}
          >

          <span>
            ${escapeHTML(
              key === 'main'
                ? displayMain(v)
                : v
            )}
          </span>
        </label>
      `).join('')}
    </div>
  `;
}

function completedMeal(g) {
  return !!(
    g.name.trim() &&
    g.starter &&
    g.main &&
    (g.main !== 'Pad Thai' || g.pad) &&
    g.dessert &&
    g.drink
  );
}

function dinnerStep() {
  return `
    <div class="section-eyebrow">
      STEP 04 / 05 · SUNDAY, JANUARY 24
    </div>

    <h2 class="section-title">
      The welcome dinner. 🍽️
    </h2>

    <p class="section-subtitle">
      We're kicking off the trip with a special
      three-course dinner at Buda Mar.

      <strong>
        It's already included — no extra charge.
      </strong>

      Please choose one starter, main, dessert
      and drink per guest.
    </p>

    <div class="notice">
      ✨ Dinner is included in your trip.
      Buda Mar will prepare your selections
      in advance.
    </div>

    ${state.guests.map((g, i) => `
      <section class="dinner-card">
        <div class="dinner-top">
          <strong>
            🍽️ ${escapeHTML(
              g.name || `Guest ${i + 1}`
            )}
          </strong>

          <span class="dinner-completion">
            ${
              completedMeal(g)
                ? '✓ Ready'
                : 'Needs selections'
            }
          </span>
        </div>

        <div class="dinner-content">
          <div class="course-title">
            01 · STARTER
            <span>Choose one</span>
          </div>

          ${radios(
            g.starter,
            STARTERS,
            'starter',
            i
          )}

          <div class="course-title">
            02 · MAIN
            <span>Choose one</span>
          </div>

          ${radios(
            g.main,
            MAINS,
            'main',
            i
          )}

          ${
            g.main === 'Pad Thai'
              ? `
                <div
                  class="field"
                  style="margin-top:12px;margin-bottom:4px"
                >
                  <label>
                    Pad Thai — choose the style
                  </label>

                  <select
                    class="select-wide"
                    data-pad="${i}"
                  >
                    <option value="">
                      Choose chicken, shrimp or vegan
                    </option>

                    ${PAD.map(v => `
                      <option
                        value="${v}"
                        ${g.pad === v ? 'selected' : ''}
                      >
                        ${v}
                      </option>
                    `).join('')}
                  </select>
                </div>
              `
              : ''
          }

          <div class="course-title">
            03 · DESSERT
            <span>Choose one</span>
          </div>

          ${radios(
            g.dessert,
            DESSERTS,
            'dessert',
            i
          )}

          <div class="course-title">
            04 · INCLUDED DRINK
            <span>Choose one</span>
          </div>

          ${radios(
            g.drink,
            DRINKS,
            'drink',
            i
          )}

          <div
            class="field"
            style="margin-top:18px;margin-bottom:0"
          >
            <label for="diet-${i}">
              Food allergies or dietary requirements
              (optional)
            </label>

            <textarea
              id="diet-${i}"
              data-allergies="${i}"
              rows="2"
              maxlength="500"
              placeholder="Anything the kitchen should know?"
            >${escapeHTML(g.allergies)}</textarea>
          </div>
        </div>
      </section>
    `).join('')}

    <div class="notice warm">
      We will pass dietary requirements to Buda Mar.

      If anyone has a serious allergy, please contact
      us directly so we can check what the kitchen
      can safely accommodate.
    </div>
  `;
}

// --------------------------------------------------
// WHATSAPP INVITATIONS
// --------------------------------------------------

function whatsappCard() {
  return `
    <div
      class="section-eyebrow"
      style="margin-top:27px"
    >
      STAY IN TOUCH
    </div>

    <h3 style="font-size:23px;margin-bottom:7px">
      WhatsApp invites for your guests
    </h3>

    <p class="step-description">
      Choose for each person separately.

      In regular social chats, members can see
      one another's phone numbers.

      In Community announcements, numbers are
      more restricted, but may be visible to
      admins and existing contacts.
    </p>

    ${state.guests.map((g, i) => `
      <section class="wa-guest-card">
        <div class="wa-guest-heading">
          <span class="guest-avatar">
            ${i + 1}
          </span>

          <div>
            <strong>
              ${escapeHTML(
                g.name || `Guest ${i + 1}`
              )}
            </strong>

            <small>
              Individual invitation preference
            </small>
          </div>
        </div>

        <div class="wa-options">
          ${[
            [
              'email',
              'Email only',
              'No WhatsApp invite'
            ],
            [
              'announcements',
              'Trip announcements',
              'Updates from your hosts'
            ],
            [
              'social',
              'Announcements + social chat',
              'Optional guest chat; your number is visible to other group members'
            ]
          ].map(([v, t, d]) => `
            <label class="whatsapp-option ${
              g.whatsapp === v
                ? 'selected'
                : ''
            }">
              <input
                type="radio"
                name="wa-${i}"
                value="${v}"
                data-wa-choice="${i}"
                ${
                  g.whatsapp === v
                    ? 'checked'
                    : ''
                }
              >

              <span>
                <strong>${t}</strong>
                <small>${d}</small>
              </span>
            </label>
          `).join('')}
        </div>

        ${
          g.whatsapp !== 'email'
            ? `
              <div class="field wa-number">
                <label for="wa-phone-${i}">
                  WhatsApp number for
                  ${escapeHTML(
                    g.name || `Guest ${i + 1}`
                  )}
                  (with country code)
                </label>

                <input
                  id="wa-phone-${i}"
                  type="tel"
                  autocomplete="tel"
                  inputmode="tel"
                  maxlength="40"
                  data-wa-phone="${i}"
                  placeholder="+1 604 555 0100"
                  value="${escapeHTML(
                    g.whatsappPhone
                  )}"
                >

                <small>
                  Used only for the requested invitation.
                </small>
              </div>
            `
            : ''
        }
      </section>
    `).join('')}

    <p
      class="step-description"
      style="margin-top:14px"
    >
      Please ask each guest before requesting
      an invite on their behalf.
      Nobody is added automatically.
    </p>
  `;
}

// --------------------------------------------------
// STEP 5 — REVIEW
// --------------------------------------------------

function reviewStep() {
  const selected =
    TOUR_DATA.filter(t => tourCount(t.id));

  return `
    <div class="section-eyebrow">
      STEP 05 / 05 · FINAL CHECK
    </div>

    <h2 class="section-title">
      Almost in holiday mode.
    </h2>

    <p class="section-subtitle">
      Check your choices and send everything through
      by <b>${DEADLINE}</b>.

      Return with your email and password to update
      them before the deadline.
    </p>

    <div class="summary-review">
      <h3>🏝️ Your booking</h3>

      <div class="review-grid">
        <div class="review-item">
          <span>Lead guest</span>
          <b>${escapeHTML(booking.lead_name)}</b>
        </div>

        <div class="review-item">
          <span>Travellers</span>
          <b>${state.guests.length}</b>
        </div>

        <div class="review-item">
          <span>Arrival</span>
          <b>
            ${
              state.arrival.status === 'booked'
                ? `${escapeHTML(state.arrival.airport)}
                   · ${escapeHTML(
                     state.arrival.arrival_date ||
                     'Date pending'
                   )}`
                : state.arrival.status === 'not_booked'
                ? 'Flight details pending'
                : 'Arriving another way'
            }
          </b>
        </div>

        <div class="review-item">
          <span>Transfer</span>
          <b>
            ${{
              yes: 'Please arrange',
              no: 'Not needed',
              unsure: 'Deciding later'
            }[state.arrival.transfer]}
          </b>
        </div>
      </div>
    </div>

    <div class="summary-review">
      <h3>🗓️ Optional tour interests</h3>

      ${
        selected.length
          ? selected.map(t => `
            <div class="summary-row">
              <span>
                ${escapeHTML(t.name)}
                <br>

                <small>
                  ${escapeHTML(
                    (state.tourGuests[t.id] || [])
                      .map(nameFor)
                      .join(', ')
                  )}
                </small>
              </span>

              <span style="text-align:right">
                <b>${mx(t.price)}</b>
                <br>
                <small>
                  ${usd(t.price)} / person
                </small>
              </span>
            </div>
          `).join('')
          : `
            <p class="step-description">
              No optional excursions selected.
            </p>
          `
      }

      <p
        class="step-description"
        style="margin-top:12px"
      >
        Tours are individually paid in cash directly
        to each operator.

        These are requests, not confirmed bookings.
      </p>
    </div>

    <div class="summary-review">
      <h3>🍽️ Welcome dinner</h3>

      ${state.guests.map((g, i) => `
        <div class="summary-row">
          <span>
            <b>
              ${escapeHTML(
                g.name || `Guest ${i + 1}`
              )}
            </b>

            <br>

            <small>
              ${escapeHTML(
                g.starter || 'Starter pending'
              )}

              ·

              ${escapeHTML(
                displayMain(
                  g.main || 'Main pending'
                )
              )}

              ${
                g.main === 'Pad Thai'
                  ? ` (${escapeHTML(
                      g.pad || 'style pending'
                    )})`
                  : ''
              }
            </small>

            <br>

            <small>
              ${escapeHTML(
                g.dessert || 'Dessert pending'
              )}

              ·

              ${escapeHTML(
                g.drink || 'Drink pending'
              )}
            </small>
          </span>

          <span class="tag included">
            INCLUDED
          </span>
        </div>
      `).join('')}
    </div>

    <div class="summary-review">
      <h3>
        🥃 Gota Gorda mezcal tasting ·
        Mon 25 · 7:30 PM
      </h3>

      <div class="summary-row">
        <span>
          ${
            state.mezcalGuests.length
              ? `
                <b>
                  ${escapeHTML(
                    state.mezcalGuests
                      .map(nameFor)
                      .join(', ')
                  )}
                </b>
                interested
              `
              : 'No confirmed interest yet'
          }

          ${
            state.mezcalMaybe.length
              ? `
                <br>
                <small>
                  Maybe:
                  ${escapeHTML(
                    state.mezcalMaybe
                      .map(nameFor)
                      .join(', ')
                  )}
                </small>
              `
              : ''
          }

          <br>

          <small>
            Personalized tasting at Buda Mar
          </small>
        </span>

        <span style="text-align:right">
          <b>${mx(MEZCAL_PRICE)}</b>
          <br>
          <small>
            ${usd(MEZCAL_PRICE)} / person
          </small>
        </span>
      </div>

      <p class="step-description">
        Payment arrangements to be confirmed
        separately.
      </p>
    </div>

    <div class="summary-review">
      <h3>
        🌅 Farewell dinner · Wed 27 · Details TBC
      </h3>

      <p class="step-description">
        Interested:

        <b>
          ${
            state.farewellGuests.length
              ? escapeHTML(
                  state.farewellGuests
                    .map(nameFor)
                    .join(', ')
                )
              : 'None selected'
          }
        </b>

        ${
          state.farewellMaybe.length
            ? `
              <br>

              Maybe:

              <b>
                ${escapeHTML(
                  state.farewellMaybe
                    .map(nameFor)
                    .join(', ')
                )}
              </b>
            `
            : ''
        }
      </p>

      <p class="step-description">
        Venue, time, menu and price to be confirmed.
        Expressing interest does not reserve a place.
      </p>
    </div>

    <div class="summary-review">
      <h3>🌺 Other requests</h3>

      <p class="step-description">
        Massage:

        <b>
          ${state.massageGuests.length} yes,
          ${state.massageMaybe.length} maybe
        </b>
      </p>
    </div>

    ${whatsappCard()}

    <div style="margin-top:24px">
      ${textarea(
        'Anything else we should know? (optional)',
        state.notes,
        'notes',
        'Accessibility requests, questions or anything else...'
      )}
    </div>

    <label class="checkline">
      <input
        type="checkbox"
        data-confirm
        ${state.confirmed ? 'checked' : ''}
      >

      <span>
        I confirm I'm completing this form for everyone
        in the booking and have permission to share these
        preferences, including WhatsApp invitation requests.

        I understand essential details, dietary requirements
        and relevant selections may be shared with the hotel
        and activity operators to arrange the trip.
      </span>
    </label>

    <div class="notice warm">
      📅 <b>Deadline: ${DEADLINE}.</b>

      Tour schedules and services are subject
      to confirmation.

      This form does not collect payment.
    </div>
  `;
}

// --------------------------------------------------
// BOOKING SIDEBAR
// --------------------------------------------------

function sidebar() {
  const selection =
    TOUR_DATA.filter(t => tourCount(t.id));

  return `
    <div class="summary">
      <div class="mini-eyebrow">
        NUDE BEACH TRIPS · YOUR BOOKING
      </div>

      <h3>Trip overview</h3>

      <div class="summary-banner">
        <small>ZIPOLITE TAKEOVER 2027</small>
        <h2>4 nights · 5 days</h2>
        <p>Jan 24–28, 2027 · Buda Mar</p>
      </div>

      <div class="summary-row">
        <span>Travellers</span>
        <span class="count">
          ${state.guests.length}
        </span>
      </div>

      <div class="summary-row">
        <span>Optional tours picked</span>
        <span class="count">
          ${selection.length} / 4
        </span>
      </div>

      <div class="summary-row">
        <span>Welcome dinners selected</span>
        <span class="count">
          ${state.guests.filter(completedMeal).length}
          / ${state.guests.length}
        </span>
      </div>

      <div class="summary-row">
        <span>Transfer requested</span>
        <span class="count">
          ${
            state.arrival.transfer === 'yes'
              ? 'Yes'
              : state.arrival.transfer === 'no'
              ? 'No'
              : 'Maybe'
          }
        </span>
      </div>

      ${
        selection.length
          ? `
            <div
              class="choice-label"
              style="margin-top:20px"
            >
              YOUR INTERESTS
            </div>

            ${selection.map(t => `
              <div class="summary-row">
                <span>
                  ${escapeHTML(t.name)}

                  <br>

                  <small>
                    ${tourCount(t.id)} interested
                  </small>
                </span>

                <span style="text-align:right">
                  <b>${mx(t.price)}</b>

                  <br>

                  <small>
                    ${usd(t.price)}/pp
                  </small>
                </span>
              </div>
            `).join('')}
          `
          : `
            <p class="summary-micro">
              Selected tours will appear here.
            </p>
          `
      }

      ${
        state.mezcalGuests.length
          ? `
            <div class="summary-row">
              <span>
                Gota Gorda mezcal tasting

                <br>

                <small>
                  ${state.mezcalGuests.length}
                  interested · Jan 25, 7:30 PM
                </small>
              </span>

              <span style="text-align:right">
                <b>${mx(MEZCAL_PRICE)}</b>

                <br>

                <small>
                  ${usd(MEZCAL_PRICE)}/pp
                </small>
              </span>
            </div>
          `
          : ''
      }

      ${
        state.farewellGuests.length ||
        state.farewellMaybe.length
          ? `
            <div class="summary-row">
              <span>
                Farewell dinner

                <br>

                <small>
                  ${state.farewellGuests.length} interested
                  · ${state.farewellMaybe.length} maybe
                  · Jan 27
                </small>
              </span>

              <span>Details TBC</span>
            </div>
          `
          : ''
      }

      <p class="summary-micro">
        <b>Not a checkout.</b>

        Tours are paid separately, in cash and
        in MXN, to each operator.

        Mezcal payment arrangements and farewell
        dinner details will be confirmed.

        USD prices are estimates based on the
        Nov 3, 2026 rate.
      </p>
    </div>
  `;
}

// --------------------------------------------------
// NAVIGATION
// --------------------------------------------------

function footer() {
  return `
    <footer class="form-footer">
      <button
        class="btn secondary"
        data-prev
        type="button"
        ${activeStep === 0 ? 'disabled' : ''}
      >
        ← Back
      </button>

      <small>
        ${activeStep + 1} of 5 ·
        Confirm by ${DEADLINE}
      </small>

      <button
        class="btn ${
          isSaving ? 'loading-btn' : ''
        }"
        data-next
        type="button"
        ${isSaving ? 'disabled' : ''}
      >
        ${
          activeStep === 4
            ? isSaving
              ? 'Sending…'
              : hasSubmitted
              ? 'Update my choices'
              : 'Send my choices'
            : 'Continue →'
        }
      </button>
    </footer>
  `;
}

function stepContent() {
  return `
    <div class="section-brandstrip">
      <span class="section-brandstrip-name">
        NUDE BEACH TRIPS
      </span>

      <span>
        ZIPOLITE · JAN 2027
      </span>
    </div>
  ` + [
    bookingStep,
    arrivalStep,
    itineraryStep,
    dinnerStep,
    reviewStep
  ][activeStep]();
}

// --------------------------------------------------
// RENDER
// --------------------------------------------------

function render() {
  const root = document.getElementById('app');

  if (isLoading) {
    root.innerHTML =
      topbar() +
      `
        <div class="loader">
          <div>
            <div class="spinner"></div>
            Loading your booking…
          </div>
        </div>
      `;

    return;
  }

  if (hasSubmitted && activeStep === 5) {
    root.innerHTML =
      topbar() +
      hero() +
      `
        <div
          class="container"
          style="padding:30px 0 70px"
        >
          <div class="main-card success-wrap">
            <div class="success-icon">
              ✓
            </div>

            <h2>Your choices are in!</h2>

            <p>
              Thanks for sharing your preferences!
              Sign in to update them until
              ${DEADLINE}.
            </p>

            <div class="success-number">
              <b>
                Booking ${escapeHTML(
                  booking.booking_ref
                )}
              </b>

              <br>

              <span class="step-description">
                ${state.guests.length} guests
                · Guest preferences
              </span>
            </div>

            <button
              class="btn"
              data-edit
              style="margin-top:22px"
            >
              ← Review my choices
            </button>
          </div>
        </div>
      `;

    return;
  }

  const locked = deadlinePassed();

  root.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      ${hero()}

      <main class="container layout">
        <div class="main-card">
          ${stepper()}

          <div class="page-content">
            ${
              locked
                ? `
                  <div class="error">
                    The December 15 guest response deadline
                    has passed. Please contact the hosts
                    for changes.
                  </div>
                `
                : ''
            }

            ${
              error
                ? `
                  <div
                    class="error"
                    role="alert"
                  >
                    ${escapeHTML(error)}
                  </div>
                `
                : ''
            }

            ${stepContent()}
          </div>

          ${
            locked
              ? `
                <div class="form-footer">
                  <small>
                    Contact your hosts for changes
                    after the deadline.
                  </small>
                </div>
              `
              : footer()
          }
        </div>

        <aside class="side">
          <div class="side-slot">
            ${sidebar()}
          </div>
        </aside>
      </main>

      <div class="footer-line">
        <strong>NUDE BEACH TRIPS</strong>
        <span>BY NUDE BEACH MAP</span>

        <em>
          SMALL GROUPS, GREAT LOCATIONS.
          ZERO AWKWARD VIBES.
        </em>
      </div>
    </div>
  `;

  if (locked) {
    root.querySelectorAll(
      'input,select,textarea,button[data-status],button[data-transfer],button[data-toggle],button[data-maybe]'
    ).forEach(el => {
      el.disabled = true;
    });
  }
}

// --------------------------------------------------
// SELECTIONS AND VALIDATION
// --------------------------------------------------

function setNested(path, value) {
  const keys = path.split('.');

  if (keys.length === 1) {
    state[keys[0]] = value;
  } else {
    state[keys[0]][keys[1]] = value;
  }
}

function toggleTour(id, i) {
  const a = state.tourGuests[id];

  state.tourGuests[id] = a.includes(i)
    ? a.filter(x => x !== i)
    : [...a, i].sort((a, b) => a - b);
}

function togglePerson(type, i, maybe = false) {
  if (TOUR_DATA.some(t => t.id === type)) {
    toggleTour(type, i);
    return;
  }

  const yes = type + 'Guests';
  const possible = type + 'Maybe';

  if (maybe) {
    state[possible] =
      state[possible].includes(i)
        ? state[possible].filter(x => x !== i)
        : [...state[possible], i];

    state[yes] =
      state[yes].filter(x => x !== i);
  } else {
    state[yes] =
      state[yes].includes(i)
        ? state[yes].filter(x => x !== i)
        : [...state[yes], i];

    state[possible] =
      state[possible].filter(x => x !== i);
  }
}

function validateStep(n) {
  if (
    n === 0 &&
    !state.guests.every(
      g => g.name.trim().length >= 2
    )
  ) {
    return 'Please enter the full name of every guest in your booking.';
  }

  if (
    n === 1 &&
    state.arrival.status === 'booked' &&
    (
      !state.arrival.arrival_date ||
      !state.arrival.flight_number.trim() ||
      !state.arrival.arrival_time
    )
  ) {
    return 'Please enter your flight arrival details, or select Still planning.';
  }

  if (
    n === 3 &&
    !state.guests.every(completedMeal)
  ) {
    return 'Please choose a starter, main, dessert and drink for each guest, including Pad Thai style where applicable.';
  }

  if (n === 4) {
    for (const g of state.guests) {
      if (
        g.whatsapp !== 'email' &&
        !validPhone(g.whatsappPhone)
      ) {
        return `Please enter a valid WhatsApp number with country code for ${g.name}.`;
      }
    }

    if (!state.confirmed) {
      return 'Please tick the confirmation box before sending.';
    }
  }

  return '';
}

function goStep(n) {
  if (n > activeStep) {
    for (
      let i = activeStep;
      i < n;
      i++
    ) {
      const message = validateStep(i);

      if (message) {
        error = message;
        render();

        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });

        return;
      }
    }
  }

  activeStep = Math.max(
    0,
    Math.min(4, n)
  );

  error = '';
  render();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// --------------------------------------------------
// INPUT HANDLERS
// --------------------------------------------------

function onChange(e) {
  const el = e.target;

  if (el.matches('[data-field]')) {
    setNested(
      el.dataset.field,
      el.value
    );

    const slot =
      document.querySelector('.side-slot');

    if (slot) {
      slot.innerHTML = sidebar();
    }

    return;
  }

  if (el.matches('[data-guest-name]')) {
    state.guests[
      Number(el.dataset.guestName)
    ].name = el.value;

    return;
  }

  if (el.matches('[data-allergies]')) {
    state.guests[
      Number(el.dataset.allergies)
    ].allergies = el.value;

    return;
  }

  if (el.matches('[data-meal]')) {
    const g = state.guests[
      Number(el.dataset.guest)
    ];

    g[el.dataset.meal] = el.value;

    if (
      el.dataset.meal === 'main' &&
      el.value !== 'Pad Thai'
    ) {
      g.pad = '';
    }

    render();
    return;
  }

  if (el.matches('[data-pad]')) {
    state.guests[
      Number(el.dataset.pad)
    ].pad = el.value;

    return;
  }

  if (el.matches('[data-wa-choice]')) {
    const g = state.guests[
      Number(el.dataset.waChoice)
    ];

    g.whatsapp = el.value;

    if (el.value === 'email') {
      g.whatsappPhone = '';
    }

    render();
    return;
  }

  if (el.matches('[data-wa-phone]')) {
    state.guests[
      Number(el.dataset.waPhone)
    ].whatsappPhone = el.value;

    return;
  }

  if (el.matches('[data-confirm]')) {
    state.confirmed = el.checked;
    return;
  }
}

function onClick(e) {
  const el = e.target.closest('button');

  if (!el || isSaving) {
    return;
  }

  if (
    el.hasAttribute('data-guest-signout')
  ) {
    forgetSession();
    loginStage = 'login';
    signInEmail = '';
    error = '';
    loginView();
    return;
  }

  if (
    el.hasAttribute('data-auth-stage')
  ) {
    loginStage = el.dataset.authStage;
    error = '';
    loginView();
    return;
  }

  if (
    el.hasAttribute('data-select-booking')
  ) {
    selectBooking(
      el.dataset.selectBooking
    );
    return;
  }

  if (el.hasAttribute('data-go')) {
    goStep(Number(el.dataset.go));
    return;
  }

  if (el.hasAttribute('data-prev')) {
    goStep(activeStep - 1);
    return;
  }

  if (el.hasAttribute('data-next')) {
    if (activeStep < 4) {
      goStep(activeStep + 1);
    } else {
      submit();
    }
    return;
  }

  if (el.hasAttribute('data-edit')) {
    hasSubmitted = false;
    goStep(4);
    return;
  }

  if (el.hasAttribute('data-status')) {
    state.arrival.status =
      el.dataset.status;

    error = '';
    render();
    return;
  }

  if (el.hasAttribute('data-transfer')) {
    state.arrival.transfer =
      el.dataset.transfer;

    render();
    return;
  }

  if (el.hasAttribute('data-toggle')) {
    togglePerson(
      el.dataset.toggle,
      Number(el.dataset.person)
    );

    render();
    return;
  }

  if (el.hasAttribute('data-maybe')) {
    togglePerson(
      el.dataset.maybe,
      Number(el.dataset.person),
      true
    );

    render();
    return;
  }
}

// --------------------------------------------------
// LOGIN SCREENS
// --------------------------------------------------

function loginView() {
  const email = `
    <div class="field">
      <label for="guest-login-email">
        Booking email
      </label>

      <input
        id="guest-login-email"
        name="email"
        type="email"
        maxlength="254"
        required
        autocomplete="email"
        value="${escapeHTML(signInEmail)}"
        placeholder="you@example.com"
      >
    </div>
  `;

  const pass = (
    auto = 'current-password'
  ) => `
    <div class="field">
      <label for="guest-password">
        Password
      </label>

      <input
        id="guest-password"
        name="password"
        type="password"
        minlength="8"
        maxlength="128"
        autocomplete="${auto}"
        required
      >
    </div>
  `;

  const content =
    loginStage === 'signup'
      ? `
        <form id="guest-signup-form">
          ${email}
          ${pass('new-password')}

          <div class="field">
            <label for="guest-repeat">
              Confirm password
            </label>

            <input
              id="guest-repeat"
              name="repeat"
              type="password"
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              required
            >
          </div>

          <button
            type="submit"
            class="btn"
            ${isSaving ? 'disabled' : ''}
          >
            ${
              isSaving
                ? 'Creating account…'
                : 'Create my account →'
            }
          </button>
        </form>

        <button
          type="button"
          class="login-change"
          data-auth-stage="login"
        >
          Already have an account? Sign in
        </button>
      `
      : loginStage === 'reset-request'
      ? `
        <form id="guest-reset-request-form">
          ${email}

          <button
            class="btn"
            type="submit"
            ${isSaving ? 'disabled' : ''}
          >
            ${
              isSaving
                ? 'Sending…'
                : 'Email me a reset link →'
            }
          </button>
        </form>

        <button
          type="button"
          class="login-change"
          data-auth-stage="login"
        >
          Back to sign in
        </button>
      `
      : loginStage === 'reset'
      ? `
        <form id="guest-reset-form">
          ${pass('new-password')}

          <div class="field">
            <label>
              Confirm new password
            </label>

            <input
              type="password"
              name="repeat"
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              required
            >
          </div>

          <button
            class="btn"
            type="submit"
            ${isSaving ? 'disabled' : ''}
          >
            ${
              isSaving
                ? 'Saving…'
                : 'Save new password →'
            }
          </button>
        </form>
      `
      : `
        <form id="guest-login-form">
          ${email}
          ${pass()}

          <button
            class="btn"
            type="submit"
            ${isSaving ? 'disabled' : ''}
          >
            ${
              isSaving
                ? 'Signing in…'
                : 'Sign in →'
            }
          </button>
        </form>

        <div class="login-links">
          <button
            type="button"
            class="login-change"
            data-auth-stage="signup"
          >
            Create an account
          </button>

          <button
            type="button"
            class="login-change"
            data-auth-stage="reset-request"
          >
            Forgot password?
          </button>
        </div>
      `;

  const headings = {
    signup: 'Create your guest account',
    'reset-request': 'Reset your password',
    reset: 'Choose a new password'
  };

  const subs = {
    signup:
      'Create an account with your email and a password of your choice. You can return to edit your preferences.',

    'reset-request':
      'We’ll email a secure password reset link if an account exists for this email.',

    reset:
      'Enter a new password for your guest account.'
  };

  document.getElementById('app').innerHTML = `
    ${topbar()}
    ${hero()}

    <main class="container login-layout">
      <section class="main-card login-panel">
        <div class="section-eyebrow">
          ONE LINK · EVERY BOOKING
        </div>

        <h2 class="section-title">
          ${
            headings[loginStage] ||
            'Welcome back'
          }
        </h2>

        <p class="section-subtitle">
          ${
            subs[loginStage] ||
            'Sign in with your booking email and password to view or update your preferences.'
          }
        </p>

        ${
          error
            ? `
              <div
                class="error"
                role="alert"
              >
                ${escapeHTML(error)}
              </div>
            `
            : ''
        }

        ${content}

        <p class="login-footnote">
          Only for confirmed Nude Beach Trips guests.
          You can edit your preferences until
          ${DEADLINE}.
        </p>
      </section>
    </main>

    <div class="footer-line">
      <strong>NUDE BEACH TRIPS</strong>
      <span>BY NUDE BEACH MAP</span>
    </div>
  `;
}

// --------------------------------------------------
// BOOKING SELECTION AND FIRST VISIT
// --------------------------------------------------

function chooseBookingView() {
  document.getElementById('app').innerHTML = `
    ${topbar()}
    ${hero()}

    <main class="container login-layout">
      <section class="main-card login-panel">
        <div class="section-eyebrow">
          BOOKINGS UNDER
          ${escapeHTML(guestEmail)}
        </div>

        <h2 class="section-title">
          Select your booking
        </h2>

        <p class="section-subtitle">
          We found more than one reservation
          for your email.
        </p>

        ${matchedBookings.map(b => `
          <button
            type="button"
            class="booking-select"
            data-select-booking="${escapeHTML(b.id)}"
          >
            <strong>
              ${escapeHTML(
                b.booking.booking_ref
              )}
            </strong>

            ·

            ${escapeHTML(
              b.booking.lead_name
            )}

            <span>
              ${b.booking.guest_count}
              guest${
                b.booking.guest_count === 1
                  ? ''
                  : 's'
              }
              →
            </span>
          </button>
        `).join('')}
      </section>
    </main>
  `;
}

function noBookingView() {
  document.getElementById('app').innerHTML = `
    ${topbar()}
    ${hero()}

    <main class="container login-layout">
      <section class="main-card login-panel">
        <div class="section-eyebrow">
          FIRST VISIT · YOUR GUEST DETAILS
        </div>

        <h2 class="section-title">
          Tell us about your booking.
        </h2>

        <p class="section-subtitle">
          Enter the lead guest and total number of
          travellers in your confirmed Nude Beach
          Trips booking.

          You'll choose preferences on the next screen.
        </p>

        ${
          error
            ? `
              <div
                class="error"
                role="alert"
              >
                ${escapeHTML(error)}
              </div>
            `
            : ''
        }

        <form id="guest-create-booking-form">
          <div class="field">
            <label for="booking-lead-name">
              Lead guest's full name
            </label>

            <input
              id="booking-lead-name"
              name="lead_name"
              minlength="2"
              maxlength="120"
              autocomplete="name"
              required
              placeholder="First and last name"
            >
          </div>

          <div class="field">
            <label for="booking-guest-count">
              Number of guests in your booking
            </label>

            <select
              id="booking-guest-count"
              name="guest_count"
              required
            >
              ${Array.from(
                { length: 8 },
                (_, i) => `
                  <option
                    value="${i + 1}"
                    ${i === 1 ? 'selected' : ''}
                  >
                    ${i + 1}
                    ${i === 0 ? 'person' : 'people'}
                  </option>
                `
              ).join('')}
            </select>
          </div>

          <label class="checkline">
            <input
              type="checkbox"
              name="confirmed_booking"
              required
            >

            <span>
              I confirm I have an existing
              Nude Beach Trips reservation
              and am completing preferences
              on behalf of everyone in my booking.
            </span>
          </label>

          <button
            type="submit"
            class="btn"
            ${isSaving ? 'disabled' : ''}
          >
            ${
              isSaving
                ? 'Creating guest record…'
                : 'Continue to preferences →'
            }
          </button>
        </form>

        <p class="login-footnote">
          Using

          <b>
            ${escapeHTML(guestEmail)}
          </b>.

          This form does not book accommodation.

          If your reservation is under another email,

          <button
            type="button"
            class="login-change"
            data-guest-signout
          >
            sign out
          </button>.
        </p>
      </section>
    </main>
  `;
}

// --------------------------------------------------
// LOAD SAVED BOOKINGS
// --------------------------------------------------

function selectBooking(id) {
  const b = matchedBookings.find(
    x => x.id === id
  );

  if (!b) return;

  selectedBookingId = id;
  booking = b.booking;

  state = normalizeState(
    b.response?.payload,
    booking.guest_count
  );

  if (
    !state.guests[0].name &&
    booking.lead_name
  ) {
    state.guests[0].name =
      booking.lead_name;
  }

  activeStep = 0;
  hasSubmitted = false;
  error = '';

  render();
}

async function loadGuest() {
  isLoading = true;
  render();

  try {
    const data = await guestApi('GET');

    matchedBookings =
      data.bookings || [];

    guestEmail =
      data.email || guestEmail;

    if (guestSession) {
      guestSession.email = guestEmail;

      sessionStorage.setItem(
        'nbt_guest_session',
        JSON.stringify(guestSession)
      );
    }

    isLoading = false;
    isSaving = false;

    if (matchedBookings.length === 1) {
      selectBooking(
        matchedBookings[0].id
      );
    } else if (matchedBookings.length > 1) {
      chooseBookingView();
    } else {
      noBookingView();
    }
  } catch (err) {
    isLoading = false;
    isSaving = false;

    error =
      err.message ||
      'Unable to load your booking.';

    loginStage = 'login';
    loginView();
  }
}

// --------------------------------------------------
// ACCOUNT ACTIONS
// --------------------------------------------------

async function loginWithPassword(
  email,
  password
) {
  signInEmail = email;
  isSaving = true;
  error = '';
  loginView();

  try {
    const data = await authRequest(
      '/token?grant_type=password',
      { email, password }
    );

    if (!data.access_token) {
      throw Error('Could not sign in.');
    }

    storeSession(data, email);
    await loadGuest();
  } catch (err) {
    error = err.message;
    loginView();
  } finally {
    isSaving = false;

    if (!guestJWT) {
      loginView();
    }
  }
}

async function signupWithPassword(
  email,
  password,
  repeat
) {
  signInEmail = email;
  isSaving = true;
  error = '';
  loginView();

  try {
    if (password !== repeat) {
      throw Error('Passwords do not match.');
    }

    const data = await authRequest(
      `/signup?redirect_to=${encodeURIComponent(
        new URL(
          './index.html',
          location.href
        ).href
      )}`,
      { email, password }
    );

    if (data.access_token) {
      storeSession(data, email);
      await loadGuest();
      return;
    }

    error =
      'Account created, but automatic sign-in is unavailable. Ask the organizers to check the Supabase Confirm Email setting.';
  } catch (err) {
    error = err.message;
  } finally {
    isSaving = false;

    if (!guestJWT) {
      loginView();
    }
  }
}

async function createMyBooking(
  lead_name,
  guest_count,
  confirmed_booking
) {
  isSaving = true;
  error = '';
  noBookingView();

  try {
    await guestApi('POST', {
      action: 'create_booking',
      lead_name,
      guest_count: Number(guest_count),
      confirmed_booking
    });

    await loadGuest();
  } catch (err) {
    error =
      err.message ||
      'Unable to create your guest record.';
  } finally {
    isSaving = false;

    if (error) {
      noBookingView();
    }
  }
}

async function requestReset(email) {
  signInEmail = email;
  isSaving = true;
  error = '';
  loginView();

  try {
    await authRequest(
      `/recover?redirect_to=${encodeURIComponent(
        new URL(
          './index.html',
          location.href
        ).href
      )}`,
      { email }
    );

    error =
      'If an account exists for this email, a password reset link has been sent.';
  } catch (err) {
    error = err.message;
  } finally {
    isSaving = false;
    loginView();
  }
}

async function updatePassword(
  password,
  repeat
) {
  isSaving = true;
  error = '';
  loginView();

  try {
    if (password !== repeat) {
      throw Error('Passwords do not match.');
    }

    const jwt = await getValidJWT();

    const r = await fetch(
      `${AUTH_BASE}/user`,
      {
        method: 'PUT',
        headers: {
          ...authHeaders(),
          authorization: `Bearer ${jwt}`
        },
        body: JSON.stringify({
          password
        })
      }
    );

    const j = await r.json().catch(
      () => ({})
    );

    if (!r.ok) {
      throw Error(
        j.error_description ||
        j.message ||
        'Unable to update password.'
      );
    }

    forgetSession();
    loginStage = 'login';

    error =
      'Password updated. Sign in using your new password.';
  } catch (err) {
    error = err.message;
  } finally {
    isSaving = false;
    loginView();
  }
}

// --------------------------------------------------
// SAVE GUEST PREFERENCES
// --------------------------------------------------

async function submit() {
  for (let i = 0; i < 5; i++) {
    const message = validateStep(i);

    if (message) {
      activeStep = i;
      error = message;
      render();

      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });

      return;
    }
  }

  if (deadlinePassed()) {
    error =
      'The response deadline has passed. Please contact your hosts.';

    render();
    return;
  }

  isSaving = true;
  error = '';
  render();

  try {
    const j = await guestApi(
      'POST',
      {
        action: 'save',
        booking_id: selectedBookingId,
        payload: state
      }
    );

    hasSubmitted = true;
    activeStep = 5;

    const b = matchedBookings.find(
      x => x.id === selectedBookingId
    );

    if (b) {
      b.response = {
        payload: structuredClone(state),
        updated_at: j.updated_at
      };
    }

    render();

    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  } catch (err) {
    error =
      err.message ||
      'Could not save preferences.';

    render();
  } finally {
    isSaving = false;
    render();
  }
}

// --------------------------------------------------
// INITIALIZE APPLICATION
// --------------------------------------------------

async function init() {
  const root =
    document.getElementById('app');

  root.addEventListener(
    'click',
    onClick
  );

  root.addEventListener(
    'input',
    onChange
  );

  root.addEventListener(
    'change',
    onChange
  );

  root.addEventListener(
    'submit',
    async e => {
      const id = e.target.id;

      if (![
        'guest-login-form',
        'guest-signup-form',
        'guest-reset-request-form',
        'guest-reset-form',
        'guest-create-booking-form'
      ].includes(id)) {
        return;
      }

      e.preventDefault();

      const form =
        new FormData(e.target);

      const email = String(
        form.get('email') || ''
      ).trim().toLowerCase();

      const password = String(
        form.get('password') || ''
      );

      if (
        id === 'guest-create-booking-form'
      ) {
        await createMyBooking(
          String(form.get('lead_name') || ''),
          form.get('guest_count'),
          form.get('confirmed_booking') === 'on'
        );

        return;
      }

      if (
        id === 'guest-login-form'
      ) {
        await loginWithPassword(
          email,
          password
        );
      }

      if (
        id === 'guest-signup-form'
      ) {
        await signupWithPassword(
          email,
          password,
          String(form.get('repeat') || '')
        );
      }

      if (
        id === 'guest-reset-request-form'
      ) {
        await requestReset(email);
      }

      if (
        id === 'guest-reset-form'
      ) {
        await updatePassword(
          password,
          String(form.get('repeat') || '')
        );
      }
    }
  );

  const hash = new URLSearchParams(
    location.hash.replace(/^#/, '')
  );

  if (
    hash.has('access_token') &&
    hash.has('refresh_token')
  ) {
    const type =
      hash.get('type');

    storeSession(
      {
        access_token:
          hash.get('access_token'),

        refresh_token:
          hash.get('refresh_token'),

        expires_in:
          Number(hash.get('expires_in')) ||
          3600
      },
      guestEmail
    );

    history.replaceState(
      null,
      '',
      location.pathname + location.search
    );

    if (type === 'recovery') {
      loginStage = 'reset';
      loginView();
      return;
    }
  }

  if (guestJWT) {
    await loadGuest();
  } else {
    loginView();
  }
}

init();
