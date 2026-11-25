# Scroll Sunset: how to recreate it

A layered sun anchored on the top-right corner of a beige page. The layers have wobbling, never-settling edges. Scrolling pulls the layers out through the corner one at a time while the page darkens. A faint texture of sparse, inclined hand-cut lines sits behind the sun.

Everything is one HTML file. CSS does all the drawing and motion. JavaScript only publishes scroll progress as one custom property. The companion file `scroll-sunset.html` is the complete working source; this document explains each part so it can be rebuilt or ported.

## The one idea that drives everything

A script writes scroll progress to `--p` (0 at the top, 1 at the bottom). Every scroll effect is a CSS `calc()` on that value.

```js
const root = document.documentElement;
let frame = 0;
const update = () => {
  frame = 0;
  const max = root.scrollHeight - innerHeight;
  const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  root.style.setProperty('--p', p.toFixed(4));
};
addEventListener('scroll', () => { frame ||= requestAnimationFrame(update); }, { passive: true });
addEventListener('resize', update);
update();
```

The body is `min-height: 400vh`, which is the scroll distance. The scene itself lives in a `position: fixed; inset: 0` stage, so it never moves; only `--p` changes.

## Tokens

```css
:root {
  color-scheme: light;

  --core:    #f9dc9c;  /* sun centre */
  --amber:   #f4ad4e;
  --orange:  #ee8a35;
  --burnt:   #de6a2b;
  --rust:    #c44f27;
  --apricot: #efb382;  /* outermost layer */
  --ink:     #3d2a1b;  /* text on paper */
  --cream:   #f6ead3;  /* text and lines at dusk */
  --night:   #1c130c;  /* page when fully scrolled */

  --display: "Instrument Serif", "Iowan Old Style", Georgia, serif;
  --body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;

  --R: 62vmin;         /* radius of the outermost layer */

  --p: 0;              /* scroll progress, written by the script */
  --p2: clamp(0, calc((var(--p) - 0.06) / 0.94), 1);  /* same, after a short still moment at the top */
}
```

Sizes are in `vmin` so the sun keeps its proportions on portrait phones and wide desktops.

## Structure

```html
<div class="stage" aria-hidden="true">
  <div class="sky"></div>      <!-- beige paper gradient -->
  <div class="dusk"></div>     <!-- dark overlay, opacity = --p -->
  <div class="figures"></div>  <!-- line texture -->
  <div class="sun">
    <div class="halo"></div>
    <div class="layers">
      <div class="layer" style="--n:0; --s:62vmin; --t:64s; --c:var(--apricot)"><b></b><b></b><b></b></div>
      <div class="layer" style="--n:1; --s:52vmin; --t:52s; --c:var(--rust)"><b></b><b></b><b></b></div>
      <div class="layer" style="--n:2; --s:43vmin; --t:44s; --c:var(--burnt)"><b></b><b></b><b></b></div>
      <div class="layer" style="--n:3; --s:34vmin; --t:36s; --c:var(--orange)"><b></b><b></b><b></b></div>
      <div class="layer" style="--n:4; --s:25vmin; --t:28s; --c:var(--amber)"><b></b><b></b><b></b></div>
      <div class="layer" style="--n:5; --s:16vmin; --t:20s; --c:var(--core)"><b></b><b></b><b></b></div>
    </div>
  </div>
</div>
<div class="stage" style="pointer-events:none">  <!-- text on top -->
  <div class="words"><h1>Keep looking.</h1><p>…</p></div>
  <p class="after">Scroll back up to bring it home.</p>
</div>
```

Per-layer inline variables: `--n` is the order (0 is outermost and leaves first), `--s` the radius, `--t` the spin period, `--c` the colour.

## Sky and dusk

```css
.sky  { background: radial-gradient(circle farthest-corner at 100% 0,
          #f8ecd6 0%, #f2e2c6 30%, #ead7b7 62%, #dcc6a1 100%); }
.dusk { background: linear-gradient(200deg, #3b2a1d 0%, var(--night) 70%);
        opacity: var(--p); }
```

The paper is lightest at the sun's corner. The dusk layer simply fades in with scroll.

## The sun: anchored on a zero-size point

```css
.sun { position: absolute; top: 0; right: 0; width: 0; height: 0; }
```

`.sun`, each `.layer` and the halo are all zero-size boxes sitting exactly on the corner. Children are centred on that point with negative offsets. This makes "shrink into the corner" trivial: scaling a layer scales it about the corner.

## Imperfect edges: three blobs per layer

A single circle with an animated `border-radius` still looks like a clean line. The fix is to build each layer from three lopsided blobs of the same colour, rotating at different speeds and in opposite directions, each morphing on its own loop. The visible edge is the union of the three, so it keeps changing and never repeats visibly (7 s, 9 s and 11 s loops share no short common period).

```css
.layer b {
  position: absolute;
  width: calc(var(--s) * 2); height: calc(var(--s) * 2);
  left: calc(var(--s) * -1); top: calc(var(--s) * -1);
  background: var(--c);
  animation: spin var(--t) linear infinite,
             morphA 7s ease-in-out infinite alternate;
  animation-delay: calc(var(--n) * -3.1s);   /* layers out of phase with each other */
}
.layer b:nth-child(2) {
  animation-name: spin, morphB;
  animation-duration: calc(var(--t) * .62), 9s;
  animation-direction: reverse, alternate;
}
.layer b:nth-child(3) {
  animation-name: spin, morphC;
  animation-duration: calc(var(--t) * .81), 11s;
}

@keyframes spin { to { rotate: 360deg; } }
@keyframes morphA {
  0%   { border-radius: 58% 42% 47% 53% / 44% 57% 43% 56%; scale: .97;  translate: 1.5% -1%; }
  50%  { border-radius: 43% 57% 56% 44% / 55% 42% 58% 45%; scale: 1.03; translate: -1.5% 1.5%; }
  100% { border-radius: 50% 50% 41% 59% / 60% 46% 54% 40%; scale: .95;  translate: 1% 2%; }
}
/* morphB and morphC: same shape of keyframes with different radii, scales and offsets */
```

The individual `rotate`, `scale` and `translate` properties are used instead of `transform` so the two animations can run on the same element without overwriting each other.

To make edges wilder, widen the border-radius spread (for example 35% to 65%) or the `translate` offsets. To calm them, narrow both.

## Scroll: layers leave through the corner

Each layer computes its own local progress `--q` from the shared `--p2`, offset by its order.

```css
.layer {
  --q: clamp(0, calc((var(--p2) - var(--n) * 0.14) / 0.3), 1);
  position: absolute; width: 0; height: 0;
  transform:
    translate(calc(var(--q) * 20vmin), calc(var(--q) * -20vmin))
    scale(calc(1 - var(--q)));
}
```

- `0.14` is the stagger between layers.
- `0.3` is how much of the scroll one layer takes to leave.
- With six layers the last one finishes at `5 × 0.14 + 0.3 = 1.0`, exactly the end of the scroll.

The scroll transform is on the `.layer` wrapper and the idle animation is on its `<b>` children, so the two never fight.

The halo behind the sun fades with `opacity: calc(1 - var(--p2))`.

## Texture: sparse inclined lines

The lines are one generated SVG tile used as a CSS mask over a flat colour. Using a mask (instead of a background image) lets the line colour be a CSS value, so it can shift from umber to cream as the page darkens.

```css
.figures {
  position: absolute; inset: -30%;     /* oversized so the tilt never exposes an edge */
  rotate: -5deg;                       /* the incline */
  background-color: color-mix(in oklab, var(--cream) calc(var(--p) * 100%), #7b5a36);
  --tile: url("data:image/svg+xml,…");
  -webkit-mask: var(--tile) 0 calc(var(--p) * -140px) / 720px 720px;
          mask: var(--tile) 0 calc(var(--p) * -140px) / 720px 720px;
  opacity: .17;                        /* overall visibility */
}
```

The mask position moves 140 px over the full scroll, which gives a slight parallax drift.

### Generating the tile

The tile is 720 × 720 px and seamless. Rows are 40 px apart. Each row is drawn as a few long, nearly straight strokes separated by long skips, with a random horizontal shift per row so no vertical seam forms. The tremor uses sine waves whose period divides the tile width, so every line meets itself at the edge.

```python
import random, math, urllib.parse

rng = random.Random(2203)
f = lambda x: ('%.1f' % x).rstrip('0').rstrip('.')

h = 40; N = 18; T = h * N            # row spacing, rows, tile size (720)
W = 2 * math.pi / T

rows = []
for j in range(N):
    a = [rng.uniform(0, 6.28) for _ in range(2)]
    off = rng.uniform(-7, 7)         # rows are not perfectly evenly spaced
    rows.append(lambda x, j=j, a=a, off=off:
        j * h + off + .8 * math.sin(2 * W * x + a[0]) + .45 * math.sin(7 * W * x + a[1]))
Y = lambda j, x: rows[j % N](x) + (j // N) * T

plan = []
for j in range(N):
    shift = rng.uniform(0, T); u = rng.uniform(0, 120); polys = []
    while u < T - 60:
        run = min(rng.uniform(110, 380), T - u - 10)     # stroke length
        n = max(1, round(run / 40))
        polys.append([shift + u + run * i / n for i in range(n + 1)])
        u += run + rng.uniform(90, 320)                   # skip length
    plan.append(polys)

d = ''
for j in range(-1, N + 1):           # one extra row above and below covers the tile edges
    for poly in plan[j % N]:
        k0 = math.floor(poly[0] / T)
        for k in (k0, k0 + 1):       # draw the wrapped copy too
            pts = [(x - k * T, Y(j, x)) for x in poly]
            if max(p[0] for p in pts) < -5 or min(p[0] for p in pts) > T + 5: continue
            if max(p[1] for p in pts) < -5 or min(p[1] for p in pts) > T + 5: continue
            d += 'M' + 'L'.join(f"{f(x)} {f(y)}" for x, y in pts)

svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='{T}' height='{T}' fill='none' "
       f"stroke='#000' stroke-width='1.3' stroke-linecap='round'><path d='{d}'/></svg>")
uri = "data:image/svg+xml," + urllib.parse.quote(svg, safe=" ='/:,.-")
print(uri)                           # paste into --tile: url("…")
```

Knobs in the generator:

| Want | Change |
|---|---|
| More or fewer lines | `h` (row spacing) and the skip range `90, 320` |
| Longer or shorter strokes | the run range `110, 380` |
| Straighter or shakier | the `.8` and `.45` tremor amplitudes |
| A different arrangement | the seed `2203` |

If `h` or `N` changes, update the `720px 720px` mask size in the CSS to the new `T`.

## Text

```css
.words { opacity: clamp(0, calc(1 - var(--p) * 2.2), 1); }           /* fades out early */
.after { color: var(--cream);
         opacity: clamp(0, calc((var(--p) - .88) / .12), 1); }       /* fades in at the end */
```

The headline is Instrument Serif italic, loaded from Google Fonts, with Georgia as the fallback.

## Accessibility and motion

```css
@media (prefers-reduced-motion: reduce) {
  .layer b { animation: none; }
}
```

The idle wobble stops for people who ask for reduced motion. Scroll control still works, because it is driven by the reader.

## Tuning reference

| What | Where | Current |
|---|---|---|
| Sun size | `--R` and each layer's `--s` | 62vmin outermost |
| Scroll length | `body { min-height }` | 400vh |
| Stagger between layers | `0.14` in `--q` | six layers end at 1.0 |
| How far layers travel out | `20vmin` in the layer transform | |
| Edge wobble speed | morph durations | 7s, 9s, 11s |
| Line incline | `rotate` on `.figures` | -5deg |
| Line visibility | `opacity` on `.figures` | .17 |
| Darkness at the end | `--night` and the `.dusk` gradient | |

## Browser notes

- Individual transform properties (`rotate`, `scale`, `translate`) and `color-mix()` need a browser from 2023 or later.
- `-webkit-mask` is kept beside `mask` for older Safari.
- The page was checked in headless Chromium at rest. Scrolled states, Safari, Firefox and phone widths were not tested.
