(function () {
  const ICON_ON = 'favicon-sun.svg';
  const ICON_OFF = 'favicon-sun-off.svg';

  function setIcon(href) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = href;
  }

  function update() {
    setIcon(document.hidden ? ICON_OFF : ICON_ON);
  }

  document.addEventListener('visibilitychange', update);
  update();
})();
