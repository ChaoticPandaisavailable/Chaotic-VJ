# Restore intrinsic atmosphere motion

The engine already advances simulation time using Motion and audio level. The new
cloud, ink and nebula shaders applied another 0.13 / 0.11 / 0.105 multiplier before
their slow domain-advection rates, making them appear nearly static. Restore those
material clocks to 1 / 0.85 / 0.8. Nested flows still travel at different rates and
directions, so the texture evolves internally. Classic remains unchanged.

No extra samples, render passes, resolution changes or saved-config edits.
Original shader: `backups/2026-10-05-before-motion-fix/atmospheres.ts`.

## Verification

`motion-check.html` is a development-only GPU regression harness. It disables
audio, camera amplitude, trails, grain and colour motion; renders at fixed time
steps; compares image pixels four seconds apart; checks Freeze and resume. Pixel
samples are copied before the WebGL drawing buffer is cleared at presentation.

At Motion 0.32, mean RGB difference (0–255 scale) over four seconds:

| Material | Before | After |
| --- | ---: | ---: |
| Clouds | 4.3488 | 23.5166 |
| Ink | 3.2885 | 17.1551 |
| Nebula | 1.6835 | 9.8659 |
| Classic | 24.0849 | 24.0849 |

Clouds at 144 Hz time steps: 23.5140, consistent with the 60 Hz result. All freeze
comparisons are exactly zero; all resume comparisons show evolving textures. All
five cases have no renderer error. This is a fixed-time animation check, not an FPS
benchmark. Results are in `test-results/motion-before.json` and `motion-after.json`.

`npm run build` passed. Production control and output pages reloaded the new build.
