(function () {
  'use strict';

  const splash = document.getElementById('splash');
  const app    = document.getElementById('app');
  const bnav   = document.getElementById('bottomNav');
  const mini   = document.getElementById('miniPlayer');

  if (!splash) return;

  const DURATION = 2800;

  setTimeout(function () {
    // Fade out splash
    splash.classList.add('hide');

    setTimeout(function () {
      // Hapus splash
      if (splash.parentNode) splash.parentNode.removeChild(splash);

      // Tampilkan app
      if (app) {
        app.style.visibility = 'visible';
        app.style.opacity    = '0';
        app.style.transition = 'opacity 0.45s ease';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            app.style.opacity = '1';
          });
        });
      }

      // Tampilkan bottom nav
      if (bnav) {
        bnav.style.visibility = 'visible';
        bnav.style.opacity    = '0';
        bnav.style.transition = 'opacity 0.45s ease 0.1s';
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            bnav.style.opacity = '1';
          });
        });
      }

      // Mini player — tampilkan hanya kalau tidak hidden
      if (mini) {
        mini.style.visibility = 'visible';
      }

    }, 650);

  }, DURATION);

}());
