// --- MOBILE DPAD CONTROLS ---
const setupDpad = (btnId, key) => {
    const btn = document.getElementById(btnId);
    if(!btn) return;
    // For touchscreens
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); keys[key] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; });
    // For clicking with a mouse (testing on PC)
    btn.addEventListener('mousedown', () => keys[key] = true);
    btn.addEventListener('mouseup', () => keys[key] = false);
    btn.addEventListener('mouseleave', () => keys[key] = false);
};
setupDpad('btn-up', 'ArrowUp');
setupDpad('btn-down', 'ArrowDown');
setupDpad('btn-left', 'ArrowLeft');
setupDpad('btn-right', 'ArrowRight');
// ----------------------------
