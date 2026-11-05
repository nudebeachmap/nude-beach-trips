
/** Zipolite 2027 guest portal. No third-party JS, no secrets in browser. */
const CONFIG = window.ZIPOLITE_CONFIG || {};

const TOUR_DATA = [
  {id:'mangroves',name:'Mangroves & Turtle Release',emoji:'🐢',price:1400,day:25,time:'6:30–10:00 AM',desc:'A beautiful non-motorized boat trip through the mangroves, wildlife spotting and a turtle-release experience where conditions allow.'},
  {id:'marine',name:'Marine Safari & Sunrise',emoji:'🐬',price:1000,day:26,time:'6:30–10:00 AM',desc:'Boat trip in search of marine wildlife, visits to secluded beaches and snorkelling (equipment included).'},
  {id:'bio',name:'Bioluminescence Lagoon',emoji:'✨',price:1600,day:26,time:'5:00–11:30 PM',desc:'An evening at the glowing lagoon, with the opportunity to swim. An optional dinner stop is at your own expense.'},
  {id:'falls',name:'Magical Waterfalls Hike',emoji:'🌿',price:2500,day:27,time:'6:00 AM–2:00 PM',desc:'Jungle trails, waterfalls, mountain pools and buffet breakfast with the local guide.'},
];

const RATE = 0.053129; // Nov 3, 2026 indicative MXN to USD
const DEADLINE = 'December 15, 2026';
const STARTERS = ['Lobster bisque','Cream of shrimp soup','Cream of mushroom soup'];
const MAINS = ['Camarones Revueltos','Pad Thai','Salmon','Pulpo Atropellado'];
const PAD = ['Chicken','Shrimp','Vegan'];
const DESSERTS = ['Tempura ice cream','Coffee flan'];
const DRINKS = ['Glass of white wine','Glass of red wine','Agua fresca (fresh fruit drink)'];
const STEPS = ['Your booking','Arrival','Your days','Welcome dinner','Review & send'];

let booking = {lead_name:'',email:'',booking_ref:'DEMO',guest_count:2};
let activeStep = 0, isDemo = false, isLoading = false, isSaving = false, hasSubmitted = false, lastSavedAt = '', error = '';
let guestSession = null;
try {
  guestSession = JSON.parse(sessionStorage.getItem('nbt_guest_session')||'null');
} catch {
  guestSession = null;
}
let guestJWT = guestSession?.access_token || '';
let guestEmail = guestSession?.email || '';
let signInEmail = '', loginStage = 'login', matchedBookings = [], selectedBookingId = '';

const AUTH_BASE = (CONFIG.supabaseUrl||'').replace(/\/$/,'')+'/auth/v1';
function authHeaders(){return {'apikey':CONFIG.publishableKey,'content-type':'application/json'};}

function storeSession(json,email){
  guestSession = {
    access_token:json.access_token,
    refresh_token:json.refresh_token,
    expires_at:Math.floor(Date.now()/1000)+(Number(json.expires_in)||3600),
    email:email||json.user?.email||guestEmail
  };
  guestJWT=guestSession.access_token;
  guestEmail=guestSession.email;
  sessionStorage.setItem('nbt_guest_session',JSON.stringify(guestSession));
}

function forgetSession(){
  guestSession=null;
  guestJWT='';
  guestEmail='';
  selectedBookingId='';
  matchedBookings=[];
  sessionStorage.removeItem('nbt_guest_session');
  sessionStorage.removeItem('nbt_guest_jwt');
  sessionStorage.removeItem('nbt_guest_email');
}

async function getValidJWT(){
  if(!guestSession?.access_token)throw Error('Please sign in again.');
  if(guestSession.expires_at && Date.now()/1000 < guestSession.expires_at-45)
    return guestSession.access_token;
  if(!guestSession.refresh_token)throw Error('Your session expired. Please sign in again.');
  const res=await fetch(`${AUTH_BASE}/token?grant_type=refresh_token`,{
    method:'POST',
    headers:authHeaders(),
    body:JSON.stringify({refresh_token:guestSession.refresh_token})
  });
  const obj=await res.json().catch(()=>({}));
  if(!res.ok||!obj.access_token){
    forgetSession();
    throw Error('Your session expired. Please sign in again.');
  }
  storeSession(obj,guestEmail);
  return guestJWT;
}

const redirectURL=()=>new URL('./index.html',location.href).href;

async function authRequest(path,body,method='POST'){
  const res=await fetch(AUTH_BASE+path,{
    method,
    headers:authHeaders(),
    body:JSON.stringify(body)
  });
  const obj=await res.json().catch(()=>({}));
  if(!res.ok)
    throw Error(obj.error_description||obj.msg||obj.message||obj.error||`Authentication error (HTTP ${res.status}).`);
  return obj;
}

const blankGuest = (name='') => ({
  name,starter:'',main:'',pad:'',dessert:'',drink:'',
  allergies:'',whatsapp:'email',whatsappPhone:''
});

let state = freshState(2);

function freshState(count){
  return {
    guests:Array.from({length:count},()=>blankGuest()),
    arrival:{
      status:'booked',airport:'HUX',arrival_date:'',
      flight_number:'',arrival_time:'',transfer:'unsure',notes:''
    },
    tourGuests:{mangroves:[],marine:[],bio:[],falls:[]},
    mezcalGuests:[],mezcalMaybe:[],
    massageGuests:[],massageMaybe:[],
    notes:'',confirmed:false
  };
}

function normalizeState(saved,guestCount){
  const p=saved&&typeof saved==='object'?saved:freshState(guestCount);
  p.guests=Array.from({length:guestCount},(_,i)=>({
    ...blankGuest(),...(p.guests?.[i]||{})
  }));
  if(p.whatsapp && ['announcements','social'].includes(p.whatsapp) &&
     p.guests[0].whatsapp==='email'){
    p.guests[0].whatsapp=p.whatsapp;
    p.guests[0].whatsappPhone=p.whatsappPhone||'';
  }
  delete p.whatsapp;
  delete p.whatsappPhone;
  return p;
}

const whatsAppPhone = value => String(value||'').replace(/[\s().-]/g,'');
const validWhatsAppPhone = value => /^\+[1-9]\d{6,14}$/.test(whatsAppPhone(value));
const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const mx = value => `MXN $${Number(value).toLocaleString('en-US')}`;
const us = value => `≈ USD $${Math.round(value*RATE).toLocaleString('en-US')}`;
const label = i => state.guests[i]?.name.trim().split(' ')[0] || `Guest ${i+1}`;
const count = id => (state.tourGuests[id] || []).length;
const api = `${(CONFIG.supabaseUrl||'').replace(/\/$/,'')}/functions/v1/zipolite-guest`;
const deadlinePassed = () => Date.now() > Date.parse('2026-12-16T05:59:59.999Z');

function topbar(){
  return `<header class="topbar">
    <a class="brand" href="https://www.nudebeachtrips.com/" target="_blank" rel="noopener">
      <img class="nbm-logo" src="https://www.nudebeachtrips.com/assets/nude-beach-map-logo.gif" alt="Nude Beach Map logo" />
      <span class="brand-word">NUDE BEACH TRIPS<small>BY NUDE BEACH MAP</small></span>
    </a>
    <div class="top-right">
      <span class="top-message">ZIPOLITE 2027 · GUEST PREFERENCES</span>
      <span class="private-pill"><span class="dot"></span>GUEST PORTAL</span>
      ${guestJWT?'<button type="button" class="signout-link" data-guest-signout>Sign out</button>':''}
    </div>
  </header>`;
}

function hero(){
  return `<section class="hero">
    <span class="hero-sun"></span>
    <div class="container">
      <div class="hero-brandline"><span class="hero-brandname">NUDE BEACH TRIPS</span><span class="hero-brand-divider"></span><span>ZIPOLITE TAKEOVER 2027</span></div>
      <div class="eyebrow">YOUR JANUARY GETAWAY</div>
      <h1>Your days in <em>paradise.</em></h1>
      <p class="hero-intro">Four nights at Buda Mar, with a packed menu of optional adventures. Choose for everyone in your booking.</p>
      <div class="hero-meta"><span>📍 Buda Mar, Zipolite</span><span>📅 Jan 24–28, 2027</span><span>⏳ Reply by Dec 15</span></div>
    </div>
  </section>`;
}

function stepper(){
  return `<nav class="stepper" aria-label="Form steps">${
    STEPS.map((x,i)=>`<button type="button" class="step ${i===activeStep?'active':i<activeStep?'done':''}" data-go="${i}" ${isSaving?'disabled':''}><span class="number">${i<activeStep?'✓':i+1}</span><span class="step-label">${x}</span></button>`).join('')
  }</nav>`;
}

function field(label,value,name,type='text',placeholder='',extra=''){
  return `<div class="field"><label for="${name}">${label}</label><input id="${name}" data-field="${name}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" ${extra}/></div>`;
}

function select(label,value,name,options){
  return `<div class="field"><label for="${name}">${label}</label><select id="${name}" data-field="${name}">${options.map(([v,l])=>`<option value="${esc(v)}" ${value===v?'selected':''}>${esc(l)}</option>`).join('')}</select></div>`;
}

function textarea(label,value,name,placeholder){
  return `<div class="field"><label for="${name}">${label}</label><textarea data-field="${name}" id="${name}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></div>`;
}

function bookingStep(){
  return `<div class="section-eyebrow">STEP 01 / 05 · THE GUEST LIST</div>
    <h2 class="section-title">Who's coming along?</h2>
    <p class="section-subtitle">Just one form per booking. You can select activities and dinner choices separately for each guest.</p>
    <div class="field-grid">
      <div class="field"><label>Lead guest</label><input type="text" value="${esc(booking.lead_name || 'Your name will appear in your invitation')}" disabled /></div>
      <div class="field"><label>Booking email</label><input type="email" value="${esc(booking.email || 'Your email will appear in your invitation')}" disabled /></div>
    </div>
    <div class="section-eyebrow" style="margin-top:14px">YOUR ${state.guests.length} GUEST${state.guests.length===1?'':'S'}</div>
    ${state.guests.map((g,i)=>`<div class="guest-row"><div class="guest-avatar">${i+1}</div><input data-guest-name="${i}" aria-label="Guest ${i+1} full name" maxlength="120" placeholder="Guest ${i+1}: first and last name" value="${esc(g.name)}"/></div>`).join('')}
    <p class="step-description" style="margin-top:14px">If the number of guests on your booking is incorrect, please contact us instead of completing another form.</p>`;
}

function arrivalStep(){
  const a=state.arrival;
  return `<div class="section-eyebrow">STEP 02 / 05 · ARRIVAL</div>
    <h2 class="section-title">Getting to Zipolite.</h2>
    <p class="section-subtitle">Share your arrival details so we know when to expect you. Airport transfers can be arranged on request.</p>
    <div class="field">
      <label class="field-label">Your travel plans</label>
      <div class="seg-box">${[['booked','Flights booked'],['not_booked','Still planning'],['not_flying','Arriving another way']].map(([v,l])=>`<button type="button" class="segment ${a.status===v?'active':''}" data-status="${v}">${l}</button>`).join('')}</div>
    </div>
    ${a.status==='booked'?`<div class="field-grid">
      ${select('Arrival airport',a.airport,'arrival.airport',[['HUX','Huatulco (HUX)'],['PXM','Puerto Escondido (PXM)'],['other','Other']])}
      ${field('Arrival date',a.arrival_date,'arrival.arrival_date','date','','min="2027-01-01" max="2027-02-15"')}
      ${field('Flight number',a.flight_number,'arrival.flight_number','text','e.g. AM 123')}
      ${field('Scheduled landing time (local)',a.arrival_time,'arrival.arrival_time','time')}
    </div>`:a.status==='not_booked'?`<div class="notice warm">You can return to add your flight details before ${DEADLINE}.</div>`:`<div class="notice">No flight details required for arrivals by road.</div>`}
    <h3 class="section-title" style="font-size:22px;margin-top:13px">Airport transfers</h3>
    <p class="section-subtitle" style="margin-bottom:14px">Want help arranging transport to Buda Mar? We can coordinate options and give you the price before you decide. You can also book your own ride.</p>
    <div class="seg-box" role="group" aria-label="Airport transfer preference">${[['yes','Please arrange'],['no','I’ll arrange my own'],['unsure','Not sure yet']].map(([v,l])=>`<button type="button" class="segment ${a.transfer===v?'active':''}" data-transfer="${v}">${l}</button>`).join('')}</div>
    ${a.transfer==='yes'?`<div class="notice">🚐 We'll follow up with the available transfer arrangements and cost. This is a request, not a paid booking.</div>`:''}
    <div style="margin-top:19px">${textarea('Anything helpful about your arrival? (optional)',a.notes,'arrival.notes','Other flight information, separate arrivals, etc.')}</div>`;
}

function picker(type,chosen,maybe=[]){
  return `<div class="pills">${state.guests.map((_,i)=>{
    const isSelected=chosen.includes(i);
    return `<button class="pill ${isSelected?'selected':''}" type="button" data-toggle="${type}" data-person="${i}" aria-pressed="${isSelected}"><span class="tick">${isSelected?'✓':''}</span>${esc(label(i))}</button>`;
  }).join('')}</div>`;
}

function maybeButtons(type){
  const yes=state[`${type}Guests`],maybe=state[`${type}Maybe`];
  return `<div class="choice-label">Interested guests</div>
    ${picker(type,yes,maybe)}
    <p class="step-description">Tap guest names to mark definite interest. Or choose “Maybe” below for anyone who's undecided.</p>
    <div class="pills" style="margin-top:9px">${state.guests.map((_,i)=>`<button type="button" class="pill ${maybe.includes(i)?'selected':''}" data-maybe="${type}" data-person="${i}" aria-pressed="${maybe.includes(i)}">${maybe.includes(i)?'✓ ':''}${esc(label(i))} · Maybe</button>`).join('')}</div>`;
}

function activityCard(item){
  const c=count(item.id);
  return `<article class="activity">
    <span class="activity-icon">${item.emoji}</span>
    <div class="activity-content">
      <div class="activity-topline">
        <div><div class="activity-title">${item.name}</div><div class="activity-time">${item.time}</div></div>
        <span class="tag paid">OPTIONAL · PAID</span>
      </div>
      <p class="activity-desc">${item.desc}</p>
      <div class="activity-price"><b>${mx(item.price)}</b><small> / person · ${us(item.price)}</small></div>
      <div class="choice-label">Who's interested?</div>
      ${picker(item.id,state.tourGuests[item.id])}
      ${c?`<div class="mini-calc">${c} guest${c===1?'':'s'} interested · ${mx(item.price*c)} (${us(item.price*c)}) paid in cash directly to this tour operator.</div>`:''}
    </div>
  </article>`;
}

function activityPlain(emoji,time,title,desc,badge='Included'){
  return `<article class="activity">
    <span class="activity-icon">${emoji}</span>
    <div class="activity-content">
      <div class="activity-topline">
        <div><div class="activity-title">${title}</div><div class="activity-time">${time}</div></div>
        <span class="tag ${badge==='Included'?'included':'tbc'}">${badge.toUpperCase()}</span>
      </div>
      <p class="activity-desc">${desc}</p>
    </div>
  </article>`;
}

function day(date,dayName,title,subtitle,items){
  return `<section class="day">
    <div class="day-header">
      <div class="date-square"><b>${date}</b><span>JAN · ${dayName.toUpperCase()}</span></div>
      <div><h3>${title}</h3><p>${subtitle}</p></div>
    </div>
    <div class="activities">${items.join('')}</div>
  </section>`;
}

function itineraryStep(){
  return `<div class="section-eyebrow">STEP 03 / 05 · MAKE IT YOURS</div>
    <h2 class="section-title">Five sun-kissed days.</h2>
    <p class="section-subtitle">Check out what's planned and tap the guests interested in each extra. Tours are optional; beach or pool time is yours to enjoy</p>
    <div class="notice warm">💸 <b>Important:</b> Optional tours run <b>on demand</b>, depending on guest interest, operator availability and conditions. <b>Each excursion is paid separately, in cash (Mexican pesos), directly to its own operator.</b> USD prices are estimates for reference only.</div>
    <div class="days">
      ${day(24,'SUN','Welcome to paradise','Sunday · Check-in day',[
        activityPlain('🏨','From 3:00 PM','Check-in at Buda Mar','Settle in, find your spot by the pool and enjoy Zipolite.'),
        activityPlain('🍽️','7:00 PM','Welcome dinner','A lovely dinner together at Buda Mar. Included for every guest. Your personal menu choices are in the next step.')
      ])}
      ${day(25,'MON','Mangroves & hidden coves','Monday · Coastal discoveries',[
        activityCard(TOUR_DATA[0]),
        activityPlain('🏝️','4:00 PM','Playa del Amor group walk','A relaxed walk to the famous clothing-optional cove.'),
        `<article class="activity">
          <span class="activity-icon">🥃</span>
          <div class="activity-content">
            <div class="activity-topline"><div><div class="activity-title">Oaxacan mezcal tasting</div><div class="activity-time">8:00 PM · Details to be confirmed</div></div><span class="tag tbc">TBC · EXTRA</span></div>
            <p class="activity-desc">We're exploring a small-group tasting. A small tasting fee will apply (amount TBC), and drinks or bottles will be available to purchase separately. We'll confirm details before any booking.</p>
            ${maybeButtons('mezcal')}
          </div>
        </article>`
      ])}
      ${day(26,'TUE','Wildlife & glowing water','Tuesday · Two optional adventures',[
        activityCard(TOUR_DATA[1]),activityCard(TOUR_DATA[2])
      ])}
      ${day(27,'WED','Waterfalls & farewell','Wednesday · One last full day',[
        activityCard(TOUR_DATA[3]),
        activityPlain('🌅','Evening · To be confirmed','Farewell get-together','An informal last evening together; any restaurant or additional costs will be confirmed separately.','Details TBC')
      ])}
      ${day(28,'THU','See you next time!','Thursday · Departure',[
        activityPlain('🧳','By 12:00 PM','Hotel check-out','Enjoy a final coffee, dip or beach stroll before heading off.')
      ])}
    </div>
    <div class="day" style="margin-top:18px">
      <div class="day-header">
        <div class="date-square" style="background:#faefde;color:#a16b39"><b style="font-size:23px">💆</b><span>ANY DAY</span></div>
        <div><h3>Fancy a hotel massage?</h3><p>Optional little luxuries</p></div>
      </div>
      <div class="activities">
        <article class="activity" style="border-top:0">
          <span class="activity-icon">🌺</span>
          <div class="activity-content">
            <div class="activity-topline"><div><div class="activity-title">Massage at Buda Mar</div><div class="activity-time">Available at the hotel · Timing and availability TBC</div></div><span class="tag paid">EXTRA · PRICE TBC</span></div>
            <p class="activity-desc">Interested in treating yourself? Let us know who might like a massage and we'll pass on details as they become available. Bookings and payment are directly with the hotel.</p>
            ${maybeButtons('massage')}
          </div>
        </article>
      </div>
    </div>
    <p class="itinerary-endnote">Beach yoga and beach games may be offered throughout the stay; details will be shared closer to departure.</p>`;
}

function radios(value,options,name,guestId){
  return `<div class="course-options">${options.map(x=>`<label class="course-option ${value===x?'chosen':''}"><input type="radio" name="${name}-${guestId}" data-meal="${name}" data-guest="${guestId}" value="${esc(x)}" ${value===x?'checked':''} /><span>${esc(x)}</span></label>`).join('')}</div>`;
}

function completedMeal(g){
  return Boolean(g.name.trim() && g.starter && g.main && (g.main!=='Pad Thai'||g.pad) && g.dessert && g.drink);
}

function dinnerStep(){
  return `<div class="section-eyebrow">STEP 04 / 05 · SUNDAY, JANUARY 24</div>
    <h2 class="section-title">The welcome dinner. 🍽️</h2>
    <p class="section-subtitle">We're kicking off the trip with a special three-course dinner at Buda Mar on Sunday evening. <strong>It's already included — no extra charge.</strong> Please make one selection per course and one included drink for every guest.</p>
    <div class="notice">✨ Your dinner is <b>complimentary as part of your booking</b>. There's nothing to pay for the listed menu. Choices help Buda Mar prepare everything in advance.</div>
    ${state.guests.map((g,i)=>`<section class="dinner-card">
      <div class="dinner-top"><strong>🍽️ ${esc(g.name || `Guest ${i+1}`)}</strong><span class="dinner-completion">${completedMeal(g)?'✓ Ready':'Needs selections'}</span></div>
      <div class="dinner-content">
        <div class="course-title">01 · STARTER <span>Choose one</span></div>
        ${radios(g.starter,STARTERS,'starter',i)}
        <div class="course-title">02 · MAIN <span>Choose one</span></div>
        ${radios(g.main,MAINS,'main',i)}
        ${g.main==='Pad Thai'?`<div class="field" style="margin-top:12px;margin-bottom:4px"><label>Pad Thai — choose the style</label><select class="select-wide" data-pad="${i}"><option value="">Choose chicken, shrimp or vegan</option>${PAD.map(x=>`<option value="${x}" ${x===g.pad?'selected':''}>${x}</option>`).join('')}</select></div>`:''}
        <div class="course-title">03 · DESSERT <span>Choose one</span></div>
        ${radios(g.dessert,DESSERTS,'dessert',i)}
        <div class="course-title">04 · INCLUDED DRINK <span>Choose one</span></div>
        ${radios(g.drink,DRINKS,'drink',i)}
        <div class="field" style="margin-top:18px;margin-bottom:0"><label for="diet-${i}">Food allergies or dietary requirements (optional)</label><textarea id="diet-${i}" data-allergies="${i}" rows="2" maxlength="500" placeholder="Anything the kitchen should know?">${esc(g.allergies)}</textarea></div>
      </div>
    </section>`).join('')}
    <div class="notice warm">We will pass dietary requirements to the restaurant, but please contact us directly if anyone has a serious allergy so we can check what the kitchen can safely accommodate.</div>`;
}

function whatsappCard(){
  return `<div class="section-eyebrow" style="margin-top:27px">STAY IN TOUCH</div>
    <h3 style="font-size:23px;margin-bottom:7px">WhatsApp invites for your guests</h3>
    <p class="step-description">Choose separately for each person in your booking. We will send invitations only to the numbers you provide. In a regular social group, group members can see one another's phone numbers; in a Community announcements group, numbers are more restricted but may still be visible to admins and existing contacts.</p>
    ${state.guests.map((g,i)=>`<section class="wa-guest-card">
      <div class="wa-guest-heading"><span class="guest-avatar">${i+1}</span><div><strong>${esc(g.name||`Guest ${i+1}`)}</strong><small>Individual invitation preference</small></div></div>
      <div class="wa-options">${[['email','Email only','No WhatsApp invite'],['announcements','Trip announcements','Updates from your hosts'],['social','Announcements + social chat','Join the optional group chat; phone number visible to other members']].map(([v,t,d])=>`<label class="whatsapp-option ${g.whatsapp===v?'selected':''}"><input type="radio" name="wa-${i}" value="${v}" data-wa-choice="${i}" ${g.whatsapp===v?'checked':''}><span><strong>${t}</strong><small>${d}</small></span></label>`).join('')}</div>
      ${g.whatsapp!=='email'?`<div class="field wa-number"><label for="wa-phone-${i}">WhatsApp number for ${esc(g.name||`Guest ${i+1}`)} (with country code)</label><input id="wa-phone-${i}" type="tel" autocomplete="tel" inputmode="tel" maxlength="40" data-wa-phone="${i}" placeholder="+1 604 555 0100" value="${esc(g.whatsappPhone)}" /><small>We'll use this number only to organize the requested invitation.</small></div>`:''}
    </section>`).join('')}
    <p class="step-description" style="margin-top:14px">Please check with each guest before requesting a WhatsApp invitation on their behalf. Nobody is added automatically.</p>`;
}

function reviewStep(){
  const selected=TOUR_DATA.filter(t=>count(t.id));
  return `<div class="section-eyebrow">STEP 05 / 05 · FINAL CHECK</div>
    <h2 class="section-title">Almost in holiday mode.</h2>
    <p class="section-subtitle">Check your requests and send everything through by <b>${DEADLINE}</b>. Sign in with your email and password to change your choices until the deadline.</p>
    <div class="summary-review">
      <h3>🏝️ Your booking</h3>
      <div class="review-grid">
        <div class="review-item"><span>Lead guest</span><b>${esc(booking.lead_name||'Demo booking')}</b></div>
        <div class="review-item"><span>Travellers</span><b>${state.guests.length} ${state.guests.length===1?'guest':'guests'}</b></div>
        <div class="review-item"><span>Arrival</span><b>${state.arrival.status==='booked'?`${esc(state.arrival.airport)} · ${esc(state.arrival.arrival_date||'Date pending')}`:state.arrival.status==='not_booked'?'Flight details pending':'Arriving another way'}</b></div>
        <div class="review-item"><span>Transfer</span><b>${{yes:'Please arrange',no:'Not needed',unsure:'Deciding later'}[state.arrival.transfer]}</b></div>
      </div>
    </div>
    <div class="summary-review">
      <h3>🗓️ Optional tour interests</h3>
      ${selected.length?selected.map(t=>`<div class="summary-row"><span>${esc(t.name)}<br/><small>${esc((state.tourGuests[t.id]||[]).map(label).join(', '))}</small></span><span style="text-align:right"><b>${mx(t.price)}</b><br/><small>${us(t.price)} / person</small></span></div>`).join(''):`<p class="step-description">No optional excursions selected.</p>`}
      <p class="step-description" style="margin-top:12px">Each tour is paid separately in pesos, cash directly to its own operator. We are collecting interest only.</p>
    </div>
    <div class="summary-review">
      <h3>🍽️ Welcome dinner</h3>
      ${state.guests.map((g,i)=>`<div class="summary-row"><span><b>${esc(g.name||`Guest ${i+1}`)}</b><br/><small>${esc(g.starter||'Starter pending')} · ${esc(g.main||'Main pending')}${g.main==='Pad Thai'?` (${esc(g.pad||'style pending')})`:''}</small><br/><small>${esc(g.dessert||'Dessert pending')} · ${esc(g.drink||'Drink pending')}</small></span><span class="tag included">INCLUDED</span></div>`).join('')}
    </div>
    <div class="summary-review">
      <h3>🌺 Other requests</h3>
      <p class="step-description">Mezcal interest: <b>${state.mezcalGuests.length} yes, ${state.mezcalMaybe.length} maybe</b> · Massage: <b>${state.massageGuests.length} yes, ${state.massageMaybe.length} maybe</b></p>
    </div>
    ${whatsappCard()}
    <div style="margin-top:24px">${textarea('Anything else we should know? (optional)',state.notes,'notes','Accessibility requirements, questions, special requests...')}</div>
    <label class="checkline"><input type="checkbox" data-confirm ${state.confirmed?'checked':''}/><span>I confirm I'm completing this form for everyone in my booking and have their permission to share these preferences, including any individual WhatsApp invitation requests. I understand that essential booking details, dietary requests and relevant selections may be shared with the hotel and activity operators to arrange our trip.</span></label>
    <div class="notice warm">📅 <b>Deadline: December 15, 2026.</b> Tour schedules, costs and services remain subject to confirmation. Any required payments for optional activities are handled with the relevant provider, not through this form.</div>`;
}

function sidebar(){
  const selection=TOUR_DATA.filter(t=>count(t.id));
  return `<div class="summary">
    <div class="mini-eyebrow">NUDE BEACH TRIPS · YOUR BOOKING</div>
    <h3>Trip overview</h3>
    <div class="summary-banner"><small>ZIPOLITE TAKEOVER 2027</small><h2>4 nights · 5 days</h2><p>Jan 24–28, 2027 · Buda Mar</p></div>
    <div class="summary-row"><span>Travellers</span><span class="count">${state.guests.length}</span></div>
    <div class="summary-row"><span>Optional tours picked</span><span class="count">${selection.length} / 4</span></div>
    <div class="summary-row"><span>Welcome dinners selected</span><span class="count">${state.guests.filter(completedMeal).length} / ${state.guests.length}</span></div>
    <div class="summary-row"><span>Transfer requested</span><span class="count">${state.arrival.transfer==='yes'?'Yes':state.arrival.transfer==='no'?'No':'Maybe'}</span></div>
    ${selection.length?`<div class="choice-label" style="margin-top:20px">YOUR INTERESTS</div>${selection.map(t=>`<div class="summary-row"><span>${esc(t.name)}<br/><small>${count(t.id)} interested</small></span><span style="text-align:right"><b>${mx(t.price)}</b><br/><small>${us(t.price)}/pp</small></span></div>`).join('')}`:`<p class="summary-micro">Selected tours will appear here.</p>`}
    <p class="summary-micro"><b>Not a checkout.</b> Every optional tour is independent and payable in cash directly to that operator, in MXN. USD prices are estimates (Nov 3, 2026 rate).</p>
  </div>`;
}

function footer(){
  return `<footer class="form-footer">
    <button class="btn secondary" data-prev type="button" ${activeStep===0?'disabled':''}>← Back</button>
    <small>${activeStep+1} of 5 · Confirm by ${DEADLINE}</small>
    <button class="btn ${isSaving?'loading-btn':''}" data-next type="button" ${isSaving?'disabled':''}>${activeStep===4?(isDemo?'Preview confirmation':isSaving?'Sending…':hasSubmitted?'Update my choices':'Send my choices'):'Continue →'}</button>
  </footer>`;
}

function stepContent(){
  return `<div class="section-brandstrip"><span class="section-brandstrip-name">NUDE BEACH TRIPS</span><span>ZIPOLITE · JAN 2027</span></div>` +
    [bookingStep,arrivalStep,itineraryStep,dinnerStep,reviewStep][activeStep]();
}

function render(){
  if(isLoading){
    document.getElementById('app').innerHTML=topbar()+`<div class="loader"><div><div class="spinner"></div>Loading your booking…</div></div>`;
    return;
  }
  if(hasSubmitted && activeStep===5){
    document.getElementById('app').innerHTML=topbar()+hero()+`<div class="container" style="padding:30px 0 70px"><div class="main-card success-wrap"><div class="success-icon">✓</div><h2>Your choices are in!</h2><p>Thanks for sharing your preferences! Sign in with your email and password to update your choices until December 15.</p><div class="success-number"><b>Booking ${esc(booking.booking_ref)}</b><br/><span class="step-description">${state.guests.length} guest${state.guests.length===1?'':'s'} · Guest preferences</span></div><button class="btn" data-edit style="margin-top:22px">← Review my choices</button></div></div>`;
    return;
  }
  const locked=deadlinePassed();
  document.getElementById('app').innerHTML=`<div class="app-shell">${topbar()}${hero()}<main class="container layout"><div class="main-card">${stepper()}<div class="page-content">${locked?`<div class="error">The December 15 guest response deadline has passed. Your existing selections can be viewed, but changes now need to be arranged directly with the hosts.</div>`:''}${error?`<div class="error" role="alert">${esc(error)}</div>`:''}${stepContent()}</div>${locked?`<div class="form-footer"><small>Contact your hosts for any changes after the deadline.</small></div>`:footer()}</div><aside class="side"><div class="side-slot">${sidebar()}</div></aside></main><div class="footer-line"><strong>NUDE BEACH TRIPS</strong><span>BY NUDE BEACH MAP</span><em>SMALL GROUPS, GREAT LOCATIONS. ZERO AWKWARD VIBES.</em></div></div>`;
  if(locked){
    document.querySelectorAll('input,select,textarea,button[data-status],button[data-transfer],button[data-toggle],button[data-maybe]').forEach(control=>{
      control.disabled=true;
    });
  }
}

function setNested(path,value){
  const bits=path.split('.');
  if(bits.length===1) state[bits[0]]=value;
  else state[bits[0]][bits[1]]=value;
}
function toggle(list,index){
  const arr=state[list];
  state[list]=arr.includes(index)?arr.filter(i=>i!==index):[...arr,index].sort((a,b)=>a-b);
}
function togglePerson(type,index,isMaybe=false){
  if(TOUR_DATA.some(t=>t.id===type)){toggleTour(type,index);return;}
  const primary=type+'Guests',secondary=type+'Maybe';
  if(isMaybe){
    if(state[secondary].includes(index)){
      state[secondary]=state[secondary].filter(i=>i!==index);
    }else{
      state[secondary].push(index);
      state[primary]=state[primary].filter(i=>i!==index);
    }
  }else{
    if(state[primary].includes(index)){
      state[primary]=state[primary].filter(i=>i!==index);
    }else{
      state[primary].push(index);
      state[secondary]=state[secondary].filter(i=>i!==index);
    }
  }
}
function toggleTour(type,index){
  const a=state.tourGuests[type];
  state.tourGuests[type]=a.includes(index)?a.filter(i=>i!==index):[...a,index].sort((a,b)=>a-b);
}

function validateStep(n){
  if(n===0&&!state.guests.every(g=>g.name.trim().length>=2))
    return 'Please enter the full name of every guest in this booking.';
  if(n===1&&state.arrival.status==='booked'&&(!state.arrival.arrival_date||!state.arrival.flight_number.trim()||!state.arrival.arrival_time))
    return 'Please include your arrival date, flight number and landing time. If flights are not booked yet, select “Still planning”.';
  if(n===3&&!state.guests.every(completedMeal))
    return 'Please select a starter, main course, dessert and drink for every guest (and Pad Thai style when applicable).';
  if(n===4){
    for(const g of state.guests){
      if(g.whatsapp!=='email'&&!validWhatsAppPhone(g.whatsappPhone))
        return `Please enter a valid international WhatsApp number for ${g.name||'each opted-in guest'} (for example +16045550100).`;
    }
    if(!state.confirmed)
      return 'Please tick the confirmation box before sending.';
  }
  return '';
}

function goStep(n){
  if(n>activeStep){
    for(let s=activeStep;s<n;s++){
      const issue=validateStep(s);
      if(issue){
        error=issue;
        render();
        window.scrollTo({top:0,behavior:'smooth'});
        return;
      }
    }
  }
  activeStep=Math.max(0,Math.min(4,n));
  error='';
  render();
  window.scrollTo({top:0,behavior:'smooth'});
}

function onChange(e){
  const el=e.target;
  if(el.matches('[data-field]')){
    setNested(el.dataset.field,el.value);
    document.querySelector('.side-slot')?.replaceChildren();
    const summarySlot=document.querySelector('.side-slot');
    if(summarySlot)summarySlot.innerHTML=sidebar();
    return;
  }
  if(el.matches('[data-guest-name]')){
    state.guests[Number(el.dataset.guestName)].name=el.value;return;
  }
  if(el.matches('[data-allergies]')){
    state.guests[Number(el.dataset.allergies)].allergies=el.value;return;
  }
  if(el.matches('[data-meal]')){
    const g=state.guests[Number(el.dataset.guest)];
    g[el.dataset.meal]=el.value;
    if(el.dataset.meal==='main' && el.value!=='Pad Thai')g.pad='';
    render();
    return;
  }
  if(el.matches('[data-pad]')){
    state.guests[Number(el.dataset.pad)].pad=el.value;return;
  }
  if(el.matches('[data-wa-choice]')){
    const g=state.guests[Number(el.dataset.waChoice)];
    g.whatsapp=el.value;
    if(el.value==='email')g.whatsappPhone='';
    render();
    return;
  }
  if(el.matches('[data-wa-phone]')){
    state.guests[Number(el.dataset.waPhone)].whatsappPhone=el.value;return;
  }
  if(el.matches('[data-confirm]')){
    state.confirmed=el.checked;return;
  }
}

function onClick(e){
  const el=e.target.closest('button');
  if(!el || isSaving)return;
  if(el.hasAttribute('data-guest-signout')){
    forgetSession();loginStage='login';signInEmail='';error='';loginView();return;
  }
  if(el.hasAttribute('data-auth-stage')){
    loginStage=el.dataset.authStage;error='';loginView();return;
  }
  if(el.hasAttribute('data-select-booking')){
    selectBooking(el.dataset.selectBooking);return;
  }
  if(el.hasAttribute('data-go')){goStep(Number(el.dataset.go));return;}
  if(el.hasAttribute('data-prev')){goStep(activeStep-1);return;}
  if(el.hasAttribute('data-next')){
    if(activeStep<4){goStep(activeStep+1);}
    else submit();
    return;
  }
  if(el.hasAttribute('data-edit')){
    hasSubmitted=false;goStep(4);return;
  }
  if(el.hasAttribute('data-status')){
    state.arrival.status=el.dataset.status;error='';render();return;
  }
  if(el.hasAttribute('data-transfer')){
    state.arrival.transfer=el.dataset.transfer;render();return;
  }
  if(el.hasAttribute('data-toggle')){
    togglePerson(el.dataset.toggle,Number(el.dataset.person));render();return;
  }
  if(el.hasAttribute('data-maybe')){
    togglePerson(el.dataset.maybe,Number(el.dataset.person),true);render();return;
  }
}

async function guestApi(method='GET',body=null){
  const jwt=await getValidJWT();
  const res=await fetch(api,{
    method,
    headers:{
      'authorization':`Bearer ${jwt}`,
      'apikey':CONFIG.publishableKey,
      'content-type':'application/json'
    },
    ...(body?{body:JSON.stringify(body)}:{})
  });
  let obj={};
  try{obj=await res.json();}catch{}
  if(!res.ok){
    if(res.status===401)forgetSession();
    throw Error(obj.error||`Unable to load booking (HTTP ${res.status}).`);
  }
  return obj;
}

function loginView(){
  const msg=error?`<div class="error" role="alert">${esc(error)}</div>`:'';
  const emailField=`<div class="field"><label for="guest-login-email">Booking email</label><input id="guest-login-email" type="email" name="email" maxlength="254" required autocomplete="email" value="${esc(signInEmail)}" placeholder="you@example.com" /></div>`;
  const passwordField=(autocomplete='current-password')=>`<div class="field"><label for="guest-password">Password</label><input id="guest-password" type="password" name="password" minlength="8" maxlength="128" required autocomplete="${autocomplete}" /></div>`;
  const content=loginStage==='signup'
    ?`<form id="guest-signup-form">${emailField}${passwordField('new-password')}<div class="field"><label for="guest-repeat">Confirm password</label><input id="guest-repeat" type="password" name="repeat" minlength="8" maxlength="128" required autocomplete="new-password" /></div><button type="submit" class="btn" ${isSaving?'disabled':''}>${isSaving?'Creating account…':'Create my account →'}</button></form><button type="button" class="login-change" data-auth-stage="login">Already have an account? Sign in</button>`
    :loginStage==='reset-request'
    ?`<form id="guest-reset-request-form">${emailField}<button class="btn" type="submit" ${isSaving?'disabled':''}>${isSaving?'Sending…':'Email me a reset link →'}</button></form><button type="button" class="login-change" data-auth-stage="login">Back to sign in</button>`
    :loginStage==='reset'
    ?`<form id="guest-reset-form">${passwordField('new-password')}<div class="field"><label>Confirm new password</label><input type="password" name="repeat" minlength="8" maxlength="128" autocomplete="new-password" required /></div><button class="btn" type="submit" ${isSaving?'disabled':''}>${isSaving?'Saving…':'Save new password →'}</button></form>`
    :`<form id="guest-login-form">${emailField}${passwordField()}<button class="btn" type="submit" ${isSaving?'disabled':''}>${isSaving?'Signing in…':'Sign in →'}</button></form><div class="login-links"><button type="button" class="login-change" data-auth-stage="signup">Create an account</button><button type="button" class="login-change" data-auth-stage="reset-request">Forgot password?</button></div>`;
  const heading={
    'signup':'Create your guest account',
    'reset-request':'Reset your password',
    'reset':'Choose a new password'
  }[loginStage]||'Welcome back';
  const subtitle={
    'signup':'Create an account with your email and a password of your choice. You can sign in and edit your guest preferences later.',
    'reset-request':'We’ll email a secure password reset link if an account exists for that address.',
    'reset':'Enter a new password for your guest account.'
  }[loginStage]||'Sign in with your booking email and password to view or update preferences for everyone on your booking.';
  document.getElementById('app').innerHTML=`${topbar()}${hero()}<main class="container login-layout"><section class="main-card login-panel"><div class="section-eyebrow">ONE LINK · EVERY BOOKING</div><h2 class="section-title">${heading}</h2><p class="section-subtitle">${subtitle}</p>${msg}${content}<p class="login-footnote">Only for confirmed Nude Beach Trips guests. You can edit your preferences until December 15, 2026.</p></section></main><div class="footer-line"><strong>NUDE BEACH TRIPS</strong><span>BY NUDE BEACH MAP</span></div>`;
}

function chooseBookingView(){
  document.getElementById('app').innerHTML=`${topbar()}${hero()}<main class="container login-layout"><section class="main-card login-panel"><div class="section-eyebrow">BOOKINGS UNDER ${esc(guestEmail)}</div><h2 class="section-title">Select your booking</h2><p class="section-subtitle">We found more than one reservation for your email.</p>${matchedBookings.map(b=>`<button type="button" class="booking-select" data-select-booking="${esc(b.id)}"><strong>${esc(b.booking.booking_ref)}</strong> · ${esc(b.booking.lead_name)} <span>${b.booking.guest_count} guest${b.booking.guest_count===1?'':'s'} →</span></button>`).join('')}</section></main>`;
}

function noBookingView(){
  document.getElementById('app').innerHTML=`${topbar()}${hero()}<main class="container login-layout"><section class="main-card login-panel"><div class="section-eyebrow">FIRST VISIT · YOUR GUEST DETAILS</div><h2 class="section-title">Tell us about your booking.</h2><p class="section-subtitle">Welcome! Please fill in the lead guest name and the total number of travellers in your confirmed Nude Beach Trips booking. You'll complete each person's preferences on the next screen.</p>${error?`<div class="error" role="alert">${esc(error)}</div>`:''}<form id="guest-create-booking-form"><div class="field"><label for="booking-lead-name">Lead guest's full name</label><input id="booking-lead-name" name="lead_name" type="text" minlength="2" maxlength="120" autocomplete="name" required placeholder="First and last name" /></div><div class="field"><label for="booking-guest-count">Number of guests in your booking</label><select id="booking-guest-count" name="guest_count" required>${Array.from({length:8},(_,i)=>`<option value="${i+1}" ${i===1?'selected':''}>${i+1} ${i===0?'person':'people'}</option>`).join('')}</select></div><label class="checkline"><input type="checkbox" name="confirmed_booking" required /><span>I confirm I have an existing Nude Beach Trips reservation and I'm completing preferences on behalf of everyone in my booking.</span></label><button type="submit" class="btn" ${isSaving?'disabled':''}>${isSaving?'Creating guest record…':'Continue to preferences →'}</button></form><p class="login-footnote">Using <b>${esc(guestEmail)}</b>. This form does not book accommodation. If your reservation is under a different email, <button type="button" class="login-change" data-guest-signout>sign out</button>.</p></section></main>`;
}

function selectBooking(id){
  const record=matchedBookings.find(x=>x.id===id);
  if(!record)return;
  selectedBookingId=id;
  booking=record.booking;
  state=normalizeState(record.response?.payload,booking.guest_count);
  if(!state.guests[0]?.name && booking.lead_name)
    state.guests[0].name=booking.lead_name;
  lastSavedAt=record.response?.updated_at||'';
  activeStep=0;
  hasSubmitted=false;
  error='';
  render();
}

// CORRECTED: Clear loading and saving before displaying the booking.
async function loadGuest(){
  isLoading=true;
  render();

  try{
    const data=await guestApi('GET');
    matchedBookings=data.bookings||[];
    guestEmail=data.email||guestEmail;

    if(guestSession){
      guestSession.email=guestEmail;
      sessionStorage.setItem('nbt_guest_session',JSON.stringify(guestSession));
    }

    isLoading=false;
    isSaving=false;

    if(matchedBookings.length===1){
      selectBooking(matchedBookings[0].id);
    }else if(matchedBookings.length>1){
      chooseBookingView();
    }else{
      noBookingView();
    }
  }catch(err){
    isLoading=false;
    isSaving=false;
    error=err.message||'Unable to load your booking.';
    loginStage='login';
    loginView();
  }
}

async function loginWithPassword(email,password){
  signInEmail=email;
  isSaving=true;
  error='';
  loginView();
  try{
    const res=await authRequest('/token?grant_type=password',{email,password});
    if(!res.access_token)throw Error('Could not sign in.');
    storeSession(res,email);
    await loadGuest();
  }catch(ex){
    error=ex.message;
    loginView();
  }finally{
    isSaving=false;
    if(!guestJWT)loginView();
  }
}

async function signupWithPassword(email,password,repeat){
  signInEmail=email;
  isSaving=true;
  error='';
  loginView();
  try{
    if(password!==repeat)throw Error('Passwords do not match.');
    const res=await authRequest(`/signup?redirect_to=${encodeURIComponent(redirectURL())}`,{email,password});
    if(res.access_token){
      storeSession(res,email);
      await loadGuest();
      return;
    }
    error='Your account was created but automatic sign-in is unavailable. Ask the organizers to check the Supabase Confirm email setting.';
  }catch(ex){
    error=ex.message;
  }finally{
    isSaving=false;
    if(!guestJWT)loginView();
  }
}

async function createMyBooking(lead_name,guest_count,confirmed_booking){
  isSaving=true;
  error='';
  noBookingView();
  try{
    await guestApi('POST',{
      action:'create_booking',
      lead_name,
      guest_count:Number(guest_count),
      confirmed_booking
    });
    error='';
    await loadGuest();
  }catch(ex){
    error=ex.message||'Unable to create your guest record.';
  }finally{
    isSaving=false;
    if(error)noBookingView();
  }
}

async function requestReset(email){
  signInEmail=email;
  isSaving=true;
  error='';
  loginView();
  try{
    await authRequest(`/recover?redirect_to=${encodeURIComponent(redirectURL())}`,{email});
    error='If an account exists for this email, a password reset link has been sent. Please check your inbox.';
  }catch(ex){
    error=ex.message;
  }finally{
    isSaving=false;
    loginView();
  }
}

async function updatePassword(password,repeat){
  isSaving=true;
  error='';
  loginView();
  try{
    if(password!==repeat)throw Error('Passwords do not match.');
    const jwt=await getValidJWT();
    const res=await fetch(`${AUTH_BASE}/user`,{
      method:'PUT',
      headers:{...authHeaders(),authorization:`Bearer ${jwt}`},
      body:JSON.stringify({password})
    });
    const obj=await res.json().catch(()=>({}));
    if(!res.ok)throw Error(obj.error_description||obj.message||'Unable to update password.');
    loginStage='login';
    forgetSession();
    error='Password updated. Sign in with your new password.';
  }catch(ex){
    error=ex.message;
  }finally{
    isSaving=false;
    loginView();
  }
}

async function submit(){
  for(let i=0;i<5;i++){
    const issue=validateStep(i);
    if(issue){
      activeStep=i;
      error=issue;
      render();
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
  }
  if(deadlinePassed()){
    error='The response deadline has passed. Please contact your hosts.';
    render();
    return;
  }
  isSaving=true;
  error='';
  render();
  try{
    const json=await guestApi('POST',{
      action:'save',
      booking_id:selectedBookingId,
      payload:state
    });
    hasSubmitted=true;
    activeStep=5;
    lastSavedAt=json.updated_at;
    const record=matchedBookings.find(x=>x.id===selectedBookingId);
    if(record)record.response={
      payload:structuredClone(state),
      updated_at:lastSavedAt
    };
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }catch(ex){
    error=ex.message||'An error occurred while saving.';
    render();
  }finally{
    isSaving=false;
    render();
  }
}

async function init(){
  const root=document.getElementById('app');

  root.addEventListener('click',onClick);
  root.addEventListener('input',onChange);
  root.addEventListener('change',onChange);

  root.addEventListener('submit',async e=>{
    const id=e.target.id;
    if(![
      'guest-login-form',
      'guest-signup-form',
      'guest-reset-request-form',
      'guest-reset-form',
      'guest-create-booking-form'
    ].includes(id))return;

    e.preventDefault();
    const f=new FormData(e.target);
    const email=String(f.get('email')||'').trim().toLowerCase();
    const password=String(f.get('password')||'');

    if(id==='guest-create-booking-form'){
      await createMyBooking(
        String(f.get('lead_name')||''),
        f.get('guest_count'),
        f.get('confirmed_booking')==='on'
      );
      return;
    }

    if(id==='guest-login-form')
      await loginWithPassword(email,password);

    if(id==='guest-signup-form')
      await signupWithPassword(email,password,String(f.get('repeat')||''));

    if(id==='guest-reset-request-form')
      await requestReset(email);

    if(id==='guest-reset-form')
      await updatePassword(password,String(f.get('repeat')||''));
  });

  const hash=new URLSearchParams(location.hash.replace(/^#/,''));

  if(hash.has('access_token') && hash.has('refresh_token')){
    const type=hash.get('type');
    storeSession({
      access_token:hash.get('access_token'),
      refresh_token:hash.get('refresh_token'),
      expires_in:Number(hash.get('expires_in'))||3600
    },guestEmail);
    history.replaceState(null,'',location.pathname+location.search);
    if(type==='recovery'){
      loginStage='reset';
      loginView();
      return;
    }
  }

  if(guestJWT){
    await loadGuest();
  }else{
    loginView();
  }
}

init();
