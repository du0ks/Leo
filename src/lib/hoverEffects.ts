/**
 * Desktop hover effects (styles live in index.css):
 *
 * - `.fx-surface` — hovering reveals a subtle grain on the element's background,
 *   strongest under the cursor. The texture is pinned to the viewport
 *   (`background-attachment: fixed`), so it continues seamlessly from one
 *   element to the next.
 * - `.fx-edge` — a thin light along the element's border near the cursor.
 *
 * This module generates the grain textures once and keeps `--mx`/`--my`
 * (cursor position relative to the element) up to date — only on the hovered
 * surface and on edge elements close to the cursor, once per animation frame.
 * Strength and on/off are CSS variables set from user settings.
 */

const TILE = 180;
const EDGE_REACH = 220; // px around the cursor in which edges are updated

function makeTextures() {
    // One random field, two tints: light specks (dark theme), dark specks (light theme).
    // Separate tiles instead of a CSS filter, which can break background-attachment: fixed.
    const field = new Float32Array(TILE * TILE).map(() => Math.pow(Math.random(), 2.2));
    const tile = (value: number, maxAlpha: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = TILE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'none';
        const img = ctx.createImageData(TILE, TILE);
        for (let p = 0; p < field.length; p++) {
            img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = value;
            img.data[p * 4 + 3] = Math.round(field[p] * maxAlpha);
        }
        ctx.putImageData(img, 0, 0);
        return `url(${canvas.toDataURL('image/png')})`;
    };
    const root = document.documentElement.style;
    root.setProperty('--noise-light', tile(255, 70));
    root.setProperty('--noise-dark', tile(15, 50));
}

export function installHoverEffects(): void {
    // Hover effects only make sense with a real pointer
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    makeTextures();

    let x = -1e5;
    let y = -1e5;
    let target: Element | null = null;
    let raf = 0;
    const near = new Set<HTMLElement>();

    const setPos = (el: HTMLElement, r: DOMRect) => {
        el.style.setProperty('--mx', `${x - r.left}px`);
        el.style.setProperty('--my', `${y - r.top}px`);
    };

    const frame = () => {
        raf = 0;

        // Grain: only the surface under the pointer needs coordinates
        const surface = target instanceof Element ? target.closest<HTMLElement>('.fx-surface') : null;
        if (surface) setPos(surface, surface.getBoundingClientRect());

        // Edge light: every edge element within reach of the cursor
        if (document.documentElement.dataset.edgeLight !== 'on') return;
        for (const el of document.querySelectorAll<HTMLElement>('.fx-edge')) {
            const r = el.getBoundingClientRect();
            const dx = Math.max(r.left - x, 0, x - r.right);
            const dy = Math.max(r.top - y, 0, y - r.bottom);
            if (dx < EDGE_REACH && dy < EDGE_REACH) {
                setPos(el, r);
                near.add(el);
            } else if (near.has(el)) {
                el.style.setProperty('--mx', '-9999px');
                near.delete(el);
            }
        }
    };
    const schedule = () => {
        if (!raf) raf = requestAnimationFrame(frame);
    };

    window.addEventListener(
        'pointermove',
        (e) => {
            x = e.clientX;
            y = e.clientY;
            target = e.target as Element | null;
            schedule();
        },
        { passive: true }
    );
    // Elements move under a still cursor when lists scroll
    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    document.documentElement.addEventListener('pointerleave', () => {
        x = y = -1e5;
        target = null;
        schedule();
    });
}
