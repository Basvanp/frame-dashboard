/* Tizen shell: show the hosted dashboard full screen and keep it awake. */
(function () {
  'use strict';

  var RELOAD_MS = 6 * 60 * 60 * 1000; // pick up new deploys a few times a day
  var frame = document.getElementById('screen');
  var msg = document.getElementById('msg');

  function screensaverOff() {
    try {
      webapis.appcommon.setScreenSaver(webapis.appcommon.AppCommonScreenSaverState.SCREEN_SAVER_OFF);
    } catch (e) {
      /* Not on a Samsung TV (e.g. the simulator) — nothing to do. */
    }
  }

  function exitApp() {
    try {
      tizen.application.getCurrentApplication().exit();
    } catch (e) {
      window.close();
    }
  }

  function show() {
    if (!window.DASHBOARD_URL) {
      msg.textContent = 'Missing DASHBOARD_URL. Run "npm run tizen:config" and rebuild the app.';
      return;
    }
    msg.textContent = '';
    frame.hidden = false;
    frame.src = window.DASHBOARD_URL;
  }

  // Remote keys go to whichever document has focus; give it to the dashboard
  // so ←/→ browse the week.
  frame.addEventListener('load', function () {
    frame.focus();
  });

  document.addEventListener('keydown', function (e) {
    if (e.keyCode === 10009) exitApp(); // Back / Return
  });

  // Back from Art Mode or another input: screensaver off again, and reload
  // the dashboard so it isn't showing whatever it had when it was paused.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      screensaverOff();
      if (window.DASHBOARD_URL) frame.src = window.DASHBOARD_URL;
    }
  });

  screensaverOff();
  show();
  setInterval(function () {
    if (window.DASHBOARD_URL) frame.src = window.DASHBOARD_URL;
  }, RELOAD_MS);
})();
