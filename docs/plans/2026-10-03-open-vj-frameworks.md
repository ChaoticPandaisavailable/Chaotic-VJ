# Open VJ framework trial

Compare Hydra (AGPL video synthesizer), Butterchurn (MIT WebGL2 MilkDrop renderer and MIT published preset package), and projectM (LGPL native library). Integrate the pinned npm Butterchurn 2.6.7 + presets 2.4.7 releases for this trial. No external runtime CDN or image dependencies.

Add eight curated, attributed presets in a separate collapsible section. Existing eleven scene indices stay unchanged. Lazy-load engine and only selected JSON presets. Two independent optional deck instances feed monochrome textures into the existing colour / transition / photo pipeline. Preserve original scenes and MIDI mappings, extend validated bounds and targets from shared catalogue metadata.

Use 1024 PCM bytes resampled from the existing audio analyser; null audio context in Butterchurn avoids new microphone permission, audio playback or timers. Stop rendering while paused. Limit source resolution, dispose WebGL contexts on engine disposal, retain last rendered scene during loading and report failures without blanking the console.

Validate preset loading and runtime shader errors, idle evolution and test music, interruption / A/B mixing, audio resampling, catalogue bounds and backward compatibility. Ship only visually useful presets after preview. Real-world simultaneous HDMI + VDJ performance is outside this short local trial.
