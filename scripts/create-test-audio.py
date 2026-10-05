"""Original 30 s, 120 BPM synthetic diagnostic rhythm; no external samples."""
import math, random, struct, wave
from pathlib import Path

rate = 24000
random.seed(1337)
destination = Path(__file__).resolve().parents[1] / 'apps' / 'performer' / 'public' / 'test-beat.wav'
destination.parent.mkdir(parents=True, exist_ok=True)
data = bytearray()
for i in range(rate * 30):
    t = i / rate
    beat = t % .5
    kick = math.sin(2 * math.pi * (46 * beat + 7 * (1 - math.exp(-beat * 35)))) * math.exp(-beat * 18) * .5
    half = t % 1
    snare_age = half - .5
    snare = (random.random() * 2 - 1) * math.exp(-max(0, snare_age) * 35) * .19 if snare_age >= 0 else 0
    hat_age = t % .25
    hat = (random.random() * 2 - 1) * math.exp(-hat_age * 100) * .06
    note = [110, 130.81, 164.81, 98][int(t / 4) % 4]
    synth = (math.sin(2 * math.pi * note * t) + .3 * math.sin(2 * math.pi * note * 2.003 * t)) * .065 * (1 - math.exp(-beat * 20)) * math.exp(-beat * 4)
    break_factor = .15 if 12 <= t < 16 else 1
    fade = min(1, t / .04, (30 - t) / .1)
    sample = max(-.95, min(.95, ((kick + snare + hat) * break_factor + synth) * fade))
    data.extend(struct.pack('<h', int(sample * 32767)))
with wave.open(str(destination), 'wb') as wav:
    wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(rate); wav.writeframes(data)
print(f'Created {destination.name}: 30 s, 120 BPM, 24 kHz mono')
