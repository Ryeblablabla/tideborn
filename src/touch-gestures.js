const TAP_TIME = 235;
const TAP_DRIFT = 17;
const DOUBLE_TIME = 285;
const DOUBLE_DRIFT = 72;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function bindTouchGestures(canvas, { active, dash, pause }) {
  const fingers = new Map();
  let lastTap;
  let pair;

  window.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || !active()) return;
    const onWater = event.target === canvas;
    if (!onWater && !event.target.closest?.('#joystick')) return;
    const tap = { x: event.clientX, y: event.clientY, at: performance.now(), onWater, moved: false };
    fingers.set(event.pointerId, tap);
    if (fingers.size === 2) {
      const entries = [...fingers.entries()];
      if (entries.every(([, finger]) => !finger.moved && tap.at - finger.at <= 145)) {
        pair = { ids: entries.map(([id]) => id), completed: 0, valid: true };
      }
    } else if (fingers.size > 2 && pair) pair.valid = false;
  }, true);

  window.addEventListener('pointermove', event => {
    const finger = fingers.get(event.pointerId);
    if (!finger || distance(finger, { x: event.clientX, y: event.clientY }) <= TAP_DRIFT) return;
    finger.moved = true;
    if (pair?.ids.includes(event.pointerId)) pair.valid = false;
  }, true);

  function end(event) {
    const finger = fingers.get(event.pointerId);
    if (!finger) return;
    fingers.delete(event.pointerId);
    const now = performance.now();
    const tap = event.type === 'pointerup' && !finger.moved && now - finger.at <= TAP_TIME;
    if (pair?.ids.includes(event.pointerId)) {
      pair.valid &&= tap;
      if (++pair.completed === 2) {
        if (pair.valid && active()) pause();
        pair = null;
        lastTap = null;
      }
      return;
    }
    if (!tap || !finger.onWater || !active()) return;
    if (lastTap && now - lastTap.at <= DOUBLE_TIME && distance(finger, lastTap) <= DOUBLE_DRIFT) {
      lastTap = null;
      dash();
    } else lastTap = { ...finger, at: now };
  }
  window.addEventListener('pointerup', end, true);
  window.addEventListener('pointercancel', end, true);
  window.addEventListener('blur', () => {
    fingers.clear();
    pair = null;
    lastTap = null;
  });
}
