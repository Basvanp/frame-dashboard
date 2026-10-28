/*
 * Frame Dashboard — the screen.
 *
 * Plain ES2019 in one classic script: it has to run in a 2022 Samsung Frame
 * (Tizen 6.5, about Chromium 85) and old Android TV WebViews, with no build.
 *
 * Query params: k (read key, remembered), lang (nl|en|es), mode (day|night|auto),
 * layout (bleed|salon|painting), date (YYYY-MM-DD, preview another week),
 * at (HH:MM, pretend it's this time).
 */
(function () {
  'use strict';

  var REFRESH_MS = 5 * 60 * 1000; // full rebuild: picks up calendar-feed changes
  var VERSION_MS = 20 * 1000; // cheap "did anything change?" check
  var BROWSE_RESET_MS = 45 * 1000;
  var MAX_EVENTS = 7;
  var EVENING_FROM = 19; // fallback if today's sunset hasn't arrived yet
  var NIGHT_UNTIL = 6; // after midnight it stays dark, but shows the new day

  var STRINGS = {
    en: {
      todaysFocus: "Today's focus",
      tomorrowsFocus: "Tomorrow's focus",
      focusFor: 'Focus',
      schedule: 'Schedule',
      tomorrow: 'Tomorrow',
      tasks: 'To do',
      tasksTomorrow: 'To do tomorrow',
      meetings: ['No meetings', '1 meeting', '{n} meetings'],
      doneOf: '{d} of {n} done',
      planned: ['Nothing planned', '1 planned', '{n} planned'],
      now: 'Now',
      minLeft: '{m} min left',
      inMin: 'in {m} min',
      fromToday: 'From today',
      noMeetings: 'No meetings',
      doneForDay: 'No more meetings today',
      noTasks: 'Nothing planned',
      greetMorning: 'Good morning',
      greetAfternoon: 'Good afternoon',
      greetEvening: 'Good evening',
      earlier: '{n} earlier',
      more: '+{n} more',
      wrapped: 'Today, wrapped',
      updated: 'Updated {t}',
      offline: 'Offline · showing {t}',
      keyTitle: 'Almost there',
      keyBody: 'Open this page with ?k=your-read-key, or set the URL in the TV app.',
      badKeyTitle: 'Key not accepted',
      badKeyBody: 'The read key in the URL does not match DASHBOARD_READ_KEY on the server.',
      wx_clear: 'Clear',
      wx_mainly: 'Mostly clear',
      wx_partly: 'Partly cloudy',
      wx_cloudy: 'Cloudy',
      wx_fog: 'Fog',
      wx_drizzle: 'Drizzle',
      wx_rain: 'Rain',
      wx_freeze: 'Freezing rain',
      wx_snow: 'Snow',
      wx_showers: 'Showers',
      wx_storm: 'Thunderstorm',
    },
    nl: {
      todaysFocus: 'Focus van vandaag',
      tomorrowsFocus: 'Focus van morgen',
      focusFor: 'Focus',
      schedule: 'Agenda',
      tomorrow: 'Morgen',
      tasks: 'Te doen',
      tasksTomorrow: 'Morgen te doen',
      meetings: ['Geen afspraken', '1 afspraak', '{n} afspraken'],
      doneOf: '{d} van {n} af',
      planned: ['Niets gepland', '1 gepland', '{n} gepland'],
      now: 'Nu',
      minLeft: 'nog {m} min',
      inMin: 'over {m} min',
      fromToday: 'Van vandaag',
      noMeetings: 'Geen afspraken',
      doneForDay: 'Geen afspraken meer vandaag',
      noTasks: 'Niets gepland',
      greetMorning: 'Goedemorgen',
      greetAfternoon: 'Goedemiddag',
      greetEvening: 'Goedenavond',
      earlier: '{n} eerder',
      more: '+{n} meer',
      wrapped: 'Vandaag afgerond',
      updated: 'Bijgewerkt {t}',
      offline: 'Offline · toont {t}',
      keyTitle: 'Bijna',
      keyBody: 'Open deze pagina met ?k=je-sleutel, of zet de URL in de tv-app.',
      badKeyTitle: 'Sleutel geweigerd',
      badKeyBody: 'De sleutel in de URL komt niet overeen met DASHBOARD_READ_KEY op de server.',
      wx_clear: 'Helder',
      wx_mainly: 'Overwegend helder',
      wx_partly: 'Half bewolkt',
      wx_cloudy: 'Bewolkt',
      wx_fog: 'Mist',
      wx_drizzle: 'Motregen',
      wx_rain: 'Regen',
      wx_freeze: 'IJzel',
      wx_snow: 'Sneeuw',
      wx_showers: 'Buien',
      wx_storm: 'Onweer',
    },
    es: {
      todaysFocus: 'Enfoque de hoy',
      tomorrowsFocus: 'Enfoque de mañana',
      focusFor: 'Enfoque',
      schedule: 'Agenda',
      tomorrow: 'Mañana',
      tasks: 'Pendientes',
      tasksTomorrow: 'Pendientes de mañana',
      meetings: ['Sin juntas', '1 junta', '{n} juntas'],
      doneOf: '{d} de {n} hechas',
      planned: ['Nada planeado', '1 planeada', '{n} planeadas'],
      now: 'Ahora',
      minLeft: 'quedan {m} min',
      inMin: 'en {m} min',
      fromToday: 'De hoy',
      noMeetings: 'Sin juntas',
      doneForDay: 'No hay más juntas hoy',
      noTasks: 'Nada planeado',
      greetMorning: 'Buenos días',
      greetAfternoon: 'Buenas tardes',
      greetEvening: 'Buenas noches',
      earlier: '{n} antes',
      more: '+{n} más',
      wrapped: 'El día, en resumen',
      updated: 'Actualizado {t}',
      offline: 'Sin conexión · mostrando {t}',
      keyTitle: 'Ya casi',
      keyBody: 'Abre esta página con ?k=tu-clave-de-lectura, o configura la URL en la app de la TV.',
      badKeyTitle: 'Clave no aceptada',
      badKeyBody: 'La clave de la URL no coincide con DASHBOARD_READ_KEY en el servidor.',
      wx_clear: 'Despejado',
      wx_mainly: 'Mayormente despejado',
      wx_partly: 'Parcialmente nublado',
      wx_cloudy: 'Nublado',
      wx_fog: 'Niebla',
      wx_drizzle: 'Llovizna',
      wx_rain: 'Lluvia',
      wx_freeze: 'Lluvia helada',
      wx_snow: 'Nieve',
      wx_showers: 'Chubascos',
      wx_storm: 'Tormenta',
    },
  };

  // Same index in every language, picked from the date so Art Mode doesn't flicker.
  // Which list depends on the hour: morning until noon, afternoon until sunset,
  // evening after that and until the wall lights up again at 6.
  var SAYINGS = {
    nl: {
      morning: [
        'De ochtend heeft goud in de mond.',
        'Goed begonnen is half gewonnen.',
        'Alle begin is moeilijk.',
        'Eerst denken, dan doen.',
        'Bezint eer ge begint.',
        'Meten is weten.',
        'Al doende leert men.',
        'Wat je zaait, zul je oogsten.',
      ],
      afternoon: [
        'Haastige spoed is zelden goed.',
        'Zachtjes aan, dan breekt het lijntje niet.',
        'De aanhouder wint.',
        'Langzaam gaan is ook vooruit.',
        'Van uitstel komt afstel.',
        'Niet geschoten is altijd mis.',
        'In de beperking toont zich de meester.',
        'Wie het kleine niet eert, is het grote niet weerd.',
      ],
      evening: [
        'Morgen is ook een dag.',
        'Oost west, thuis best.',
        'Eerst slapen, dan beslissen.',
        'Na gedane arbeid is het goed rusten.',
        'Na regen komt zonneschijn.',
        'Het is altijd het donkerst voor de dageraad.',
        'Spreken is zilver, zwijgen is goud.',
        'Wie rust, rust op tijd.',
      ],
    },
    en: {
      morning: [
        'The morning has gold in its mouth.',
        'Well begun is half done.',
        'Every beginning is hard.',
        'Think first, then do.',
        'Look before you leap.',
        'Measure twice, cut once.',
        'We learn by doing.',
        'You reap what you sow.',
      ],
      afternoon: [
        'More haste, less speed.',
        'Easy does it.',
        'Slow and steady wins.',
        'Slow is still forward.',
        'Put off is put away.',
        'Nothing ventured, nothing gained.',
        'Restraint is the master.',
        'Mind the small things.',
      ],
      evening: [
        'Tomorrow is another day.',
        'East or west, home is best.',
        'Sleep on it.',
        'Rest is sweet after the work.',
        'After rain comes sunshine.',
        'Darkest just before dawn.',
        'Speech is silver, silence is gold.',
        'Rest while you can.',
      ],
    },
    es: {
      morning: [
        'A quien madruga, Dios le ayuda.',
        'Lo bien empezado está a medio hacer.',
        'Todo comienzo es difícil.',
        'Primero pensar, luego hacer.',
        'Antes de empezar, pensar.',
        'Medir es saber.',
        'Haciendo se aprende.',
        'Lo que siembras, cosechas.',
      ],
      afternoon: [
        'Vísteme despacio, que tengo prisa.',
        'Despacio, que el hilo no se rompe.',
        'Quien la sigue, la consigue.',
        'Ir despacio también es avanzar.',
        'Lo que se aplaza, se olvida.',
        'El que no tira, no da.',
        'En la limitación se ve al maestro.',
        'Quien no valora lo pequeño, no merece lo grande.',
      ],
      evening: [
        'Mañana también es un día.',
        'Este o oeste, casa es lo mejor.',
        'Dormir, y luego decidir.',
        'Tras el trabajo, bien descansar.',
        'Después de la lluvia, el sol.',
        'Siempre es más oscuro antes del alba.',
        'Hablar es de plata, callar es de oro.',
        'Quien descansa, descansa a tiempo.',
      ],
    },
  };

  var params = new URLSearchParams(location.search);
  var state = {
    data: null,
    offline: false,
    selected: null, // ymd being browsed with the remote, or null
    browseTimer: null,
    artShown: null,
    lastLoad: 0,
    version: null,
    build: null,
    skew: 0, // server clock minus TV clock; TVs drift, the server doesn't
  };

  function $(id) {
    return document.getElementById(id);
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      /* storage blocked: the screen still works, it just forgets */
    }
    return null;
  }

  function readKey() {
    var k = params.get('k');
    if (k) store('fd:key', k);
    return k || store('fd:key');
  }

  function lang() {
    var q = (params.get('lang') || '').slice(0, 2).toLowerCase();
    if (STRINGS[q]) return q;
    var s = ((state.data && state.data.locale) || '').slice(0, 2).toLowerCase();
    // "en" is the old stock default. The wall speaks Dutch unless asked otherwise.
    if (s === 'es' || s === 'nl') return s;
    return 'nl';
  }

  function intlLocale() {
    if (lang() === 'es') return 'es-MX';
    if (lang() === 'nl') return 'nl-NL';
    return 'en-US';
  }

  function t(key, vars) {
    var s = STRINGS[lang()][key];
    if (s == null) s = STRINGS.en[key];
    Object.keys(vars || {}).forEach(function (k) {
      s = s.split('{' + k + '}').join(vars[k]);
    });
    return s;
  }

  // ['none', 'one', 'many'] forms.
  function plural(key, n) {
    var forms = STRINGS[lang()][key];
    var s = n === 0 ? forms[0] : n === 1 ? forms[1] : forms[2];
    return s.split('{n}').join(n);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ── Time, always in the dashboard's zone (not the TV's) ──────────────

  function tz() {
    return (state.data && state.data.tz) || undefined;
  }

  // ?at=HH:MM fakes the time of day, for previewing the evening view.
  function now() {
    var base = new Date(Date.now() + state.skew);
    var at = params.get('at');
    if (!at || !state.data) return base;
    var p = at.split(':');
    var offsetHour = localParts(base).hour;
    var offsetMin = localParts(base).minute;
    var delta = (Number(p[0]) - offsetHour) * 60 + (Number(p[1] || 0) - offsetMin);
    return new Date(base.getTime() + delta * 60000);
  }

  function localParts(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz(),
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    var out = {};
    parts.forEach(function (p) {
      out[p.type] = Number(p.value);
    });
    return out;
  }

  function timeParts(date) {
    var parts = new Intl.DateTimeFormat(intlLocale(), {
      timeZone: tz(),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    var main = '';
    parts.forEach(function (p) {
      if (p.type === 'hour' || p.type === 'minute' || (p.type === 'literal' && main)) main += p.value;
    });
    return { main: main.trim() };
  }

  function shortTime(iso) {
    return timeParts(new Date(iso)).main;
  }

  function ymdOf(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  // Noon UTC keeps a bare date on the same calendar day in every zone.
  function fmtDay(ymd, opts) {
    return new Intl.DateTimeFormat(intlLocale(), Object.assign({ timeZone: 'UTC' }, opts)).format(
      new Date(ymd + 'T12:00:00Z')
    );
  }

  // ── Which day, which mode ─────────────────────────────────────────────

  function findDay(ymd) {
    var d = state.data;
    if (!d) return null;
    for (var i = 0; i < d.days.length; i++) if (d.days[i].date === ymd) return d.days[i];
    if (d.tomorrow && d.tomorrow.date === ymd) return d.tomorrow;
    return null;
  }

  // Sunset comes from Open-Meteo in the dashboard's zone. Until it arrives,
  // 19:00 is the fallback so a missing forecast doesn't pin the wall to day.
  function pastSunset() {
    var w = state.data && state.data.weather;
    var p = localParts(now());
    if (!w || w.sunsetHour == null) return p.hour >= EVENING_FROM;
    if (p.hour !== w.sunsetHour) return p.hour > w.sunsetHour;
    return p.minute >= (w.sunsetMinute || 0);
  }

  function isNight() {
    var mode = params.get('mode') || 'auto';
    if (mode !== 'auto') return mode === 'night';
    var h = localParts(now()).hour;
    return pastSunset() || h < NIGHT_UNTIL;
  }

  // In the evening, the wall text turns to tomorrow. After midnight it is the
  // new day already, so it shows "today" again, just with the lights down.
  function isEvening() {
    var mode = params.get('mode');
    if (mode === 'night') return true;
    if (mode === 'day') return false;
    return pastSunset();
  }

  // Before 6 the wall is still dark, so the line stays an evening one.
  function partOfDay() {
    var h = localParts(now()).hour;
    if (pastSunset() || h < NIGHT_UNTIL) return 'evening';
    if (h < 12) return 'morning';
    return 'afternoon';
  }

  function saying(ymd) {
    var all = SAYINGS[lang()] || SAYINGS.nl;
    var list = all[partOfDay()];
    var n = 0;
    var key = ymd || '';
    for (var i = 0; i < key.length; i++) n = (n * 33 + key.charCodeAt(i)) | 0;
    return list[(n >>> 0) % list.length];
  }

  // The design (Settings → layout): "bleed" and "painting" keep the work as
  // the wall, day and night (night uses a dark glass placard so bone paper
  // doesn't glare). "salon" keeps the gallery wall all day.
  function useBleed(art, night) {
    var layout = params.get('layout') || (state.data && state.data.layout) || 'bleed';
    if (layout === 'salon') return false;
    return !!art;
  }

  // Full bleed: the painting a little larger than the stage, centred in the
  // area left of the placard (x < 1228). Wide works simply fill the screen.
  function placeBleed(img, ratio) {
    var h = Math.round(1080 * 1.08);
    var w = Math.round(h * ratio);
    img.style.height = h + 'px';
    img.style.top = Math.round((1080 - h) / 2) + 'px';
    if (w >= 1920) {
      img.style.left = '0px';
      img.style.width = '1920px';
      img.classList.remove('feathered');
      return;
    }
    var left = Math.max(0, Math.round((1228 - w) / 2));
    img.style.width = w + 'px';
    img.style.left = left + 'px';
    // A work flush with the screen's left edge keeps that edge crisp.
    img.classList.toggle('feathered', true);
    img.style.webkitMaskImage = img.style.maskImage = left === 0
      ? 'linear-gradient(90deg, #000 calc(100% - 60px), transparent 100%)'
      : '';
  }

  // ── Layout ───────────────────────────────────────────────────────────

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var x = (window.innerWidth - 1920 * s) / 2;
    var y = (window.innerHeight - 1080 * s) / 2;
    $('stage').style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }

  // Unframed, as large as the left wall above the label will take.
  var HANG = { cx: 540, cy: 448, maxW: 1040, maxH: 850 };

  function hangArt(art) {
    if (!art || state.artShown === art.image) return;
    state.artShown = art.image;

    var innerW = HANG.maxW;
    var innerH = HANG.maxH;
    var ratio = art.ratio || 1.3;
    var w = innerW;
    var h = w / ratio;
    if (h > innerH) {
      h = innerH;
      w = h * ratio;
    }
    var outerW = Math.round(w);
    var outerH = Math.round(h);
    var left = Math.round(HANG.cx - outerW / 2);
    var top = Math.round(HANG.cy - outerH / 2);

    var artBox = document.querySelector('.art');
    var bleed = $('bleed');
    var fill = $('bleed-fill');
    artBox.classList.remove('is-in');
    $('label').classList.remove('is-in');
    bleed.classList.remove('is-in');
    fill.classList.remove('is-in');

    var img = new Image();
    img.onload = function () {
      var frame = $('frame');
      frame.className = 'frame';
      frame.style.left = left + 'px';
      frame.style.top = top + 'px';
      frame.style.width = outerW + 'px';
      frame.style.height = outerH + 'px';

      var painting = $('painting');
      painting.src = img.src;
      painting.alt = art.title + ', ' + art.artist;

      $('label-artist').textContent = art.artist;
      $('label-title').textContent = art.title + (art.date ? ', ' + art.date : '');
      $('label-meta').textContent = [medium(art.medium), art.collection].filter(Boolean).join(' · ');

      bleed.src = img.src;
      bleed.alt = painting.alt;
      fill.src = img.src;
      placeBleed(bleed, ratio);
      $('credit-title').textContent = art.title;
      $('credit-meta').textContent = [art.artist + (art.date ? ', ' + art.date : ''), art.collection]
        .filter(Boolean)
        .join(' · ');
      var factEl = $('credit-fact');
      clear(factEl);
      if (art.fact) {
        factEl.appendChild(document.createTextNode(art.fact));
        factEl.appendChild(el('span', 'via', 'Wikipedia'));
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          artBox.classList.add('is-in');
          $('label').classList.add('is-in');
          bleed.classList.add('is-in');
          fill.classList.add('is-in');
        });
      });
    };
    // A museum image that fails to load is replaced by a local painting,
    // so the frame is never empty.
    img.onerror = function () {
      if (art.fallback && state.artShown === art.image) {
        state.artShown = null;
        hangArt(art.fallback);
      }
    };
    img.src = art.image;
  }

  // ── Rendering ────────────────────────────────────────────────────────

  // Line icons, engraved like the rest of the placard. One drawing per kind.
  var SUN = '<circle cx="16" cy="16" r="4.5"/><path d="M16 5.2v2.4M16 24.4v2.4M5.2 16h2.4M24.4 16h2.4M8.3 8.3l1.7 1.7M22 22l1.7 1.7M23.7 8.3 22 10M10 22l-1.7 1.7"/>';
  var CLOUD = '<path d="M9 16.2h14.2a4 4 0 0 0 .3-8 5.7 5.7 0 0 0-11 1.5 3.6 3.6 0 0 0-3.5 6.5z"/>';
  var ICONS = {
    clear: SUN,
    mainly: SUN,
    partly:
      '<circle cx="22.2" cy="9.2" r="2.7"/><path d="M22.2 4.2v1.6M22.2 12.6v1.6M17.2 9.2h1.6M25.6 9.2h1.6M18.6 5.6l1.1 1.1M24.7 11.7l1.1 1.1M25.8 5.6l-1.1 1.1M18.6 12.8l1.1-1.1"/><path d="M7.4 24.2h13.4a3.9 3.9 0 0 0 .3-7.8 5.5 5.5 0 0 0-10.6 1.5 3.5 3.5 0 0 0-3.1 6.3z"/>',
    cloudy: '<path d="M8.2 22.4h15.6a4.8 4.8 0 0 0 .4-9.6 6.8 6.8 0 0 0-13 1.8 4.3 4.3 0 0 0-3 7.8z"/>',
    fog: '<path d="M6 10.5h20M8 15.5h16M6 20.5h20M9 25.5h14"/>',
    drizzle: CLOUD + '<path d="M14 19.2v4.2M18.6 19.2v4.2"/>',
    rain: CLOUD + '<path d="M12.4 19v6.2M16.6 19v6.2M20.8 19v6.2"/>',
    freeze: CLOUD + '<path d="M12.4 19v6.2M16.6 19v6.2M20.8 19v6.2"/>',
    showers: CLOUD + '<path d="M12.4 19v6.2M16.6 19v6.2M20.8 19v6.2"/>',
    snow: CLOUD + '<path d="M12.2 19.4v4.2M10.4 21.5h3.6M17 19.4v4.2M15.2 21.5h3.6M21.6 19.4v4.2M19.8 21.5h3.6"/>',
    storm: CLOUD + '<path d="M18.2 17.6 15 23h2.8l-1.3 5 5.2-6h-2.8l1.3-4.4z"/>',
  };

  function renderClock() {
    $('clock-time').textContent = timeParts(now()).main;
  }

  function renderWeather() {
    var box = $('weather');
    var meta = $('weather-meta');
    var w = state.data && state.data.weather;
    if (!w || w.temp == null || !w.kind) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    $('weather-icon').innerHTML =
      '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[w.kind] || ICONS.cloudy) +
      '</svg>';
    $('weather-temp').textContent = w.temp + '°';
    var bits = [];
    if (w.low != null && w.high != null) bits.push(w.low + '–' + w.high + '°');
    else if (w.high != null) bits.push(w.high + '°');
    if (w.rain) bits.push(w.rain + '%');
    meta.textContent = bits.join(' · ');
    meta.hidden = !bits.length;
    var label = w.temp + '°, ' + t('wx_' + w.kind);
    if (w.low != null && w.high != null) label += ', ' + w.low + '–' + w.high + '°';
    if (w.rain) label += ', ' + w.rain + '%';
    box.setAttribute('aria-label', label);
  }

  // First ICS_URLS feed is the household calendar (glass glow). Later feeds
  // get a short tag from ICS_LABELS — afval, school, and so on.
  function isMine(e) {
    return e.calendar == null || e.calendar === 0;
  }

  function calTag(e) {
    var name = e.label;
    if (!name && state.data && state.data.calendars && e.calendar != null) {
      name = state.data.calendars[e.calendar];
    }
    if (!name || isMine(e)) return '';
    return String(name).slice(0, 16);
  }

  function alldayRow(e) {
    var li = el('li', isMine(e) ? 'mine' : '');
    li.appendChild(document.createTextNode(e.title));
    var tag = calTag(e);
    if (tag) li.appendChild(el('span', 'cal', tag));
    return li;
  }

  function timedEvents(day) {
    return day.events.filter(function (e) {
      return !e.allDay;
    });
  }

  function renderEvents(day, live) {
    var allday = $('allday');
    var list = $('events');
    clear(allday);
    clear(list);

    day.events.forEach(function (e) {
      if (e.allDay) allday.appendChild(alldayRow(e));
    });

    var timed = timedEvents(day);
    $('schedule-count').textContent = plural('meetings', timed.length);
    if (!timed.length) {
      list.appendChild(el('li', 'empty-line', t('noMeetings')));
      return;
    }

    var t0 = now().getTime();
    var lead = null; // the meeting you're in, else the next one
    if (live) {
      for (var i = 0; i < timed.length; i++) {
        if (Date.parse(timed[i].end) > t0) {
          lead = timed[i];
          break;
        }
      }
    }

    // What's over is over: past meetings leave the list (the header counts
    // them), which frees rows for the to-dos.
    var shown = live
      ? timed.filter(function (e) {
          return Date.parse(e.end) > t0;
        })
      : timed.slice();
    var hidden = timed.length - shown.length;
    if (hidden) $('schedule-count').textContent += ' · ' + t('earlier', { n: hidden });
    if (!shown.length) list.appendChild(el('li', 'empty-line', t('doneForDay')));
    var overflow = Math.max(0, shown.length - MAX_EVENTS);

    shown.slice(0, MAX_EVENTS).forEach(function (e) {
      var s = Date.parse(e.start);
      var en = Date.parse(e.end);
      var inProgress = live && s <= t0 && en > t0;
      var cls = [];
      if (live && en <= t0) cls.push('past');
      if (e === lead) cls.push('lead');
      if (inProgress) cls.push('now');
      if (isMine(e)) cls.push('mine');

      var li = el('li', cls.join(' '));
      li.appendChild(el('span', 'time', shortTime(e.start)));
      var what = el('div', 'what');
      what.appendChild(el('div', 'title', e.title));
      var tag = calTag(e);
      if (tag) what.appendChild(el('div', 'cal', tag));
      if (e === lead && e.location) what.appendChild(el('div', 'where', e.location.split('\n')[0]));
      li.appendChild(what);

      if (e === lead) {
        var tail = inProgress
          ? t('minLeft', { m: Math.max(1, Math.round((en - t0) / 60000)) })
          : s - t0 < 90 * 60000
          ? t('inMin', { m: Math.max(1, Math.round((s - t0) / 60000)) })
          : null;
        if (tail) li.appendChild(el('span', 'tail', tail));
      }
      list.appendChild(li);
    });
    if (overflow) list.appendChild(el('li', 'more', t('more', { n: overflow })));
  }

  // Plans written by hand may list tasks as plain strings.
  function tasksOf(day) {
    return (day.tasks || [])
      .map(function (x) {
        return typeof x === 'string' ? { text: x, done: false, tag: null } : x;
      })
      .filter(function (x) {
        return x && x.text;
      });
  }


  function dayStamp(ymd) {
    return fmtDay(ymd, { weekday: 'short' }).replace(/\./g, '').toUpperCase() + ' ' + Number(ymd.slice(8));
  }

  function setTomorrowLine(text) {
    var line = $('tomorrow-focus');
    line.hidden = !text;
    line.textContent = text || '';
  }

  function clearTomorrowAgenda() {
    clear($('tomorrow-allday'));
    clear($('tomorrow-events'));
  }

  // Timed rows, same placard treatment as today's agenda, without "now".
  function renderTomorrowAgenda(tomorrow) {
    var allday = $('tomorrow-allday');
    var list = $('tomorrow-events');
    clear(allday);
    clear(list);
    var events = (tomorrow && tomorrow.events) || [];
    events.forEach(function (e) {
      if (e.allDay) allday.appendChild(alldayRow(e));
    });
    var timed = events.filter(function (e) {
      return !e.allDay && e.start;
    });
    var overflow = Math.max(0, timed.length - MAX_EVENTS);
    timed.slice(0, MAX_EVENTS).forEach(function (e) {
      var li = el('li', isMine(e) ? 'mine' : '');
      li.appendChild(el('span', 'time', shortTime(e.start)));
      var what = el('div', 'what');
      what.appendChild(el('div', 'title', e.title));
      var tag = calTag(e);
      if (tag) what.appendChild(el('div', 'cal', tag));
      li.appendChild(what);
      list.appendChild(li);
    });
    if (overflow) list.appendChild(el('li', 'more', t('more', { n: overflow })));
    return events.length;
  }

  // Daytime placard: tomorrow's focus and appointments. Evening already turns
  // the whole column into tomorrow, so that block is hidden.
  function renderTomorrow(tomorrow) {
    var focus = tomorrow && tomorrow.focus;
    setTomorrowLine(focus || '');
    $('tasks-label').textContent = t('tomorrow');
    $('tasks-count').textContent = tomorrow ? dayStamp(tomorrow.date) : '';
    renderTomorrowAgenda(tomorrow);
  }

  var MEDIUMS_ES = {
    'oil on canvas': 'Óleo sobre tela',
    'oil on linen canvas': 'Óleo sobre lino',
    'oil on jute canvas': 'Óleo sobre yute',
    'oil on panel': 'Óleo sobre tabla',
    'color woodblock print': 'Xilografía a color',
    watercolor: 'Acuarela',
    'transparent watercolor': 'Acuarela',
  };

  function medium(m) {
    if (!m || lang() !== 'es') return m;
    return MEDIUMS_ES[m.toLowerCase()] || m;
  }

  var WORDS = {
    en: ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'],
    nl: ['Geen', 'Eén', 'Twee', 'Drie', 'Vier', 'Vijf', 'Zes', 'Zeven', 'Acht', 'Negen', 'Tien'],
    es: ['Ninguna', 'Una', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'],
  };

  function word(n, lower) {
    var w = n <= 10 ? WORDS[lang()][n] : String(n);
    return lower ? w.toLowerCase() : w;
  }

  // "Four meetings, three of four done. One moves to tomorrow."
  function recapText(today, carried) {
    var m = timedEvents(today).length;
    var total = tasksOf(today).length;
    var done = tasksOf(today).filter(function (x) {
      return x.done;
    }).length;
    var c = carried.length;
    var out = [];
    if (lang() === 'es') {
      out.push(
        (m === 1 ? 'Una junta' : m === 0 ? 'Sin juntas' : word(m) + ' juntas') +
          (total ? ', ' + word(done, true) + ' de ' + word(total, true) + ' hechas.' : '.')
      );
      if (c) out.push(c === 1 ? 'Una pasa a mañana.' : word(c) + ' pasan a mañana.');
    } else if (lang() === 'nl') {
      var meetings = m === 1 ? 'Eén afspraak' : m === 0 ? 'Geen afspraken' : word(m) + ' afspraken';
      var doneBit = !total ? '.' : done === 0 ? ', nog niets af.' : ', ' + word(done, true) + ' van ' + word(total, true) + ' af.';
      out.push(meetings + doneBit);
      if (c) out.push(c === 1 ? 'Eén schuift door naar morgen.' : word(c) + ' schuiven door naar morgen.');
    } else {
      out.push(
        (m === 1 ? 'One meeting' : word(m) + ' meetings') +
          (total ? ', ' + word(done, true) + ' of ' + word(total, true) + ' done.' : '.')
      );
      if (c) out.push(word(c) + (c === 1 ? ' moves' : ' move') + ' to tomorrow.');
    }
    return out.join(' ');
  }

  function renderWeek(shownDate) {
    var list = $('week');
    var today = ymdOf(now());
    clear(list);
    state.data.days.forEach(function (d) {
      var cls = [];
      var dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      if (dow === 0 || dow === 6) cls.push('is-weekend');
      if (d.date < today) cls.push('is-past');
      if (d.date === today) cls.push('is-today');
      else if (d.date === shownDate) cls.push('is-selected');
      var li = el('li', cls.join(' '));
      li.appendChild(el('div', 'wk-day', fmtDay(d.date, { weekday: 'short' }).replace('.', '').toUpperCase()));
      li.appendChild(el('div', 'wk-num', String(Number(d.date.slice(8)))));
      var dots = el('div', 'wk-dots');
      var n = Math.min(4, timedEvents(d).length);
      for (var i = 0; i < n; i++) dots.appendChild(el('i'));
      li.appendChild(dots);
      list.appendChild(li);
    });
  }

  function renderStatus() {
    var d = state.data;
    var stamp = shortTime(d.generatedAt);
    var msg = state.offline ? t('offline', { t: stamp }) : t('updated', { t: stamp });
    if (d.errors && d.errors.length && !state.offline) msg = d.errors[0] + ' · ' + msg;
    $('status').textContent = msg;
  }

  // A bad record must never stop the screen from refreshing: log and carry on.
  function render() {
    try {
      draw();
    } catch (err) {
      if (window.console) console.error(err);
    }
  }

  function draw() {
    var night = isNight();
    renderClock();
    renderWeather();
    if (!state.data) {
      document.body.className = night ? 'night' : '';
      return;
    }

    var todayYmd = ymdOf(now());
    var today = findDay(todayYmd);
    // Trust the server's idea of today if the TV's clock disagrees anyway.
    if (!today && !params.get('date') && findDay(state.data.today)) {
      todayYmd = state.data.today;
      today = findDay(todayYmd);
    }
    // ?date= previews another week: treat its Monday as "today".
    if (!today && params.get('date')) {
      today = state.data.days[0];
      todayYmd = today.date;
    }
    if (!today && !state.selected) {
      // The week rolled over since the last fetch. Ask again, at most once a
      // minute, so a TV that is offline with a stale cache doesn't spin.
      if (Date.now() - state.lastLoad > 60 * 1000) load();
      return;
    }

    var evening = !state.selected && isEvening() && state.data.tomorrow;
    var day = state.selected ? findDay(state.selected) : evening ? state.data.tomorrow : today;
    var live = !state.selected && !evening; // "now", countdowns, past fading

    var art = (state.selected ? day : today).art;
    document.body.className =
      (night ? 'night' : '') + (useBleed(art, night) ? ' bleed' : '') + (state.selected ? ' browsing' : '');

    $('eyebrow').textContent = fmtDay(state.selected || todayYmd, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    $('focus-label').textContent = state.selected
      ? t('focusFor')
      : evening
      ? t('tomorrowsFocus')
      : t('todaysFocus');
    var focus = $('focus');
    focus.className = 'focus-text' + (day.focus ? '' : ' empty');
    focus.textContent = day.focus || (state.data.planned ? '' : saying(day.date));

    $('schedule-label').textContent = evening ? t('tomorrow') : t('schedule');

    var carried =
      evening && today
        ? tasksOf(today).filter(function (x) {
            return !x.done;
          })
        : [];

    renderEvents(day, live);
    if (!state.selected && !evening) {
      $('ahead').hidden = false;
      renderTomorrow(state.data.tomorrow);
    } else {
      $('ahead').hidden = true;
      setTomorrowLine('');
      clearTomorrowAgenda();
    }

    var recap = $('recap');
    recap.hidden = !(evening && today);
    if (evening && today) {
      $('recap-label').textContent = t('wrapped');
      $('recap-text').textContent = recapText(today, carried);
    }

    renderWeek(day.date);
    renderStatus();
    // The painting belongs to the calendar day, not to the view: tonight's
    // painting is still today's.
    hangArt(art);
    document.documentElement.lang = lang();
  }

  // ── Data ─────────────────────────────────────────────────────────────

  function notice(titleKey, bodyKey) {
    $('notice-title').textContent = t(titleKey);
    $('notice-body').textContent = t(bodyKey);
    $('notice').hidden = false;
  }

  function load() {
    state.lastLoad = Date.now();
    var key = readKey();
    var q = new URLSearchParams();
    if (key) q.set('k', key);
    if (params.get('date')) q.set('date', params.get('date'));

    return fetch('api/week?' + q.toString(), { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 401) {
          notice(key ? 'badKeyTitle' : 'keyTitle', key ? 'badKeyBody' : 'keyBody');
          throw new Error('unauthorized');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        $('notice').hidden = true;
        state.skew = Date.parse(data.generatedAt) - Date.now();
        if (Math.abs(state.skew) < 60 * 1000) state.skew = 0;
        state.data = data;
        state.offline = false;
        store('fd:week', JSON.stringify(data));
        render();
      })
      .catch(function (err) {
        if (err.message === 'unauthorized') return;
        state.offline = true;
        render();
      });
  }

  // Edits from the Mac app or Claude bump a version on the server. Poll it
  // often (one tiny request) and reload the week only when it moves.
  function checkVersion() {
    var key = readKey();
    fetch('api/version' + (key ? '?k=' + encodeURIComponent(key) : ''), { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (body) {
        if (!body) return;
        // A new deploy: reload the page itself so the screen runs the new code
        // (the TV app would otherwise keep the old page until it's reopened).
        if (state.build && body.build && body.build !== state.build) {
          location.reload();
          return;
        }
        state.build = body.build || state.build;
        if (state.version !== null && body.version !== state.version) load();
        state.version = body.version;
      })
      .catch(function () {
        /* offline: the next full refresh will notice */
      });
  }

  // ── Remote: ←/→ browse the week, OK/↑/↓ back to today ────────────────

  function browse(step) {
    if (!state.data) return;
    var dates = state.data.days.map(function (d) {
      return d.date;
    });
    var today = ymdOf(now());
    var from = dates.indexOf(state.selected || today);
    if (from < 0) from = 0;
    var to = Math.max(0, Math.min(dates.length - 1, from + step));
    state.selected = dates[to] === today ? null : dates[to];
    clearTimeout(state.browseTimer);
    if (state.selected) {
      state.browseTimer = setTimeout(function () {
        state.selected = null;
        render();
      }, BROWSE_RESET_MS);
    }
    render();
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 37) browse(-1);
    else if (k === 39) browse(1);
    else if (k === 13) {
      // OK: back to today, and fetch fresh data.
      state.selected = null;
      render();
      load();
    } else if (k === 38 || k === 40) {
      state.selected = null;
      render();
    } else return;
    e.preventDefault();
  });

  // ── Boot ─────────────────────────────────────────────────────────────

  // The three painting <img>s start without a source, so they are created
  // here rather than shipped empty in the HTML.
  function makeImg(id, cls, parent, before) {
    var img = document.createElement('img');
    img.id = id;
    img.className = cls;
    img.alt = '';
    parent.insertBefore(img, before || null);
    return img;
  }
  var scrim = document.querySelector('.scrim');
  makeImg('bleed-fill', 'bleed-fill', scrim.parentNode, scrim).setAttribute('aria-hidden', 'true');
  makeImg('bleed', 'bleed-art', scrim.parentNode, scrim);
  makeImg('painting', 'painting', $('liner'));

  window.addEventListener('resize', fit);
  fit();
  try {
    state.data = JSON.parse(store('fd:week') || 'null');
  } catch (e) {
    state.data = null;
  }
  render();
  load();
  setInterval(load, REFRESH_MS);
  checkVersion();
  setInterval(checkVersion, VERSION_MS);
  // Coming back from Art Mode or another input: timers may have been paused,
  // so catch up at once instead of waiting for the next tick.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      checkVersion();
      load();
    }
  });
  window.addEventListener('focus', function () {
    checkVersion();
  });
  setInterval(render, 20 * 1000);
})();
