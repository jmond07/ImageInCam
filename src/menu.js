import { drawStampThumb } from './stamps.js';

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
    $('m-add').disabled = v.libraryFull;
    $('m-hide-label').textContent = v.hidden ? 'Show images' : 'Hide images';
    $('m-pause-label').textContent = v.paused ? 'Resume tracking' : 'Pause tracking';
    $('m-zone-label').textContent = v.zoneEditing ? 'Finish editing zone' : 'Edit spawn zone';
    $('m-hands1').classList.toggle('on', v.hands === 1);
    $('m-hands2').classList.toggle('on', v.hands === 2);
    $('m-mirror').checked = v.mirror;
    $('m-skeleton').checked = v.skeleton;
    $('m-lab').checked = v.lab;
  }

  // The list of saved images, with a button to remove each one
  function renderLibrary(stamps, onRemove) {
    const list = $('m-library');
    list.replaceChildren();

    if (!stamps.length) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'No saved images yet.';
      list.append(empty);
      return;
    }

    stamps.forEach((stamp, i) => {
      const row = document.createElement('div');
      row.className = 'entry';

      const thumb = document.createElement('canvas');
      thumb.width = thumb.height = 64; // drawn at 2x, shown at 32px
      drawStampThumb(thumb, stamp);

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = `${i + 1}. ${stamp.name}`;
      name.title = stamp.name;

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = 'Remove from library';
      remove.setAttribute('aria-label', `Remove ${stamp.name}`);
      remove.addEventListener('click', () => onRemove(stamp));

      row.append(thumb, name, remove);
      list.append(row);
    });
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
    else showResetConfirm(false);
    wake();
  }

  button.addEventListener('click', () => {
    setOpen(!open);
    button.blur();
  });

  // "Reset settings" asks for confirmation inline (and gives up by itself after 5 s)
  let resetTimer = null;
  function showResetConfirm(on) {
    clearTimeout(resetTimer);
    $('m-reset').hidden = on;
    $('m-reset-confirm').hidden = !on;
    if (on) resetTimer = setTimeout(() => showResetConfirm(false), 5000);
  }

  root.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const action = el.dataset.action;

    // The reset button asks first, right below itself
    if (action === 'askReset') {
      showResetConfirm(true);
    } else if (action === 'cancelReset') {
      showResetConfirm(false);
    } else {
      handlers[action]?.();
      if (action === 'resetSettings') showResetConfirm(false);
    }

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
    renderLibrary,
  };
}