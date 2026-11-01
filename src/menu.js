// Side menu: wires the buttons to handlers and keeps their labels in sync with the app.
// handlers: { [data-action]: () => void }. getView(): current app state for the menu.
export function createMenu(handlers, getView) {
  const root = document.getElementById('menu');
  const button = document.getElementById('menu-btn');
  const $ = (id) => document.getElementById(id);
  let open = false;
  let idleTimer = null;

  function sync() {
    const v = getView();
    $('m-undo').disabled = !v.canUndo || v.hidden;
    $('m-redo').disabled = !v.canRedo || v.hidden;
    $('m-clear').disabled = !v.hasImages || v.hidden;
    $('m-hide-label').textContent = v.hidden ? 'Show images' : 'Hide images';
    $('m-pause-label').textContent = v.paused ? 'Resume tracking' : 'Pause tracking';
    $('m-zone-label').textContent = v.zoneEditing ? 'Finish editing zone' : 'Edit spawn zone';
    $('m-hands1').classList.toggle('on', v.hands === 1);
    $('m-hands2').classList.toggle('on', v.hands === 2);
    $('m-mirror').checked = v.mirror;
    $('m-lab').checked = v.lab;
  }

  // The menu button fades out when the mouse has been still for a while
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!open) document.body.classList.add('idle');
    }, 2500);
  }

  function setOpen(on) {
    open = on;
    root.classList.toggle('open', on);
    root.setAttribute('aria-hidden', String(!on));
    button.setAttribute('aria-expanded', String(on));
    if (on) sync();
    wake();
  }

  button.addEventListener('click', () => {
    setOpen(!open);
    button.blur();
  });

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    handlers[el.dataset.action]?.();
    sync();
    el.blur();
  });

  document.addEventListener('mousemove', wake);
  wake();

  return {
    get isOpen() {
      return open;
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    sync,
  };
}