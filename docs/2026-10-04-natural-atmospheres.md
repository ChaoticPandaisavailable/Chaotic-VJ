# Natural atmospheres, visible output sizes and colour reset

The user requested all three artistic directions: billowing storm clouds, flowing ink landscapes, and energetic nebula/magma. Make them explicit Chaos atmospheres alongside the existing classic material. They share the current palette, Chaotic control and saved presets. Transition between materials with eased normalized weights; keep the original scene transition machinery.

Clouds use a low-frequency flow with selective detail inside large connected masses. Ink follows long diagonally sweeping sheets with eroded, feathered edges. Nebula uses broad spiral arms, an offset core and sparse stars. Avoid periodic contour embossing in the new materials. Use broad illumination and restrained highlights; keep negative space.

At the circled top readout, add an output resolution selector: automatic, 1920×1080, 2560×1440 and 3840×2160. Explicit choices are real framebuffer and internal-field sizes, preserved in presets and applied to the active output even outside fullscreen. The controller preview is independently rendered at up to 1440p, with its dimensions clearly labelled. Keep frame pacing and pause hidden non-owner tabs.

YOUR PALETTE gains Reset, which restores colour settings from the selected/loaded palette's baseline and supports one-step Undo. Only colour settings reset: retain scene, texture, light, MIDI and resolution. Capture this baseline at theme/palette/preset selection and before the first custom edit, persist it with configuration.

Validate legacy schema migration, fixed dimensions/aspect limits, reset/undo boundaries and storage, then inspect all three materials, classic continuity, and the controls in one browser proof batch. Keep current runtime configuration and user's named presets backed up.
