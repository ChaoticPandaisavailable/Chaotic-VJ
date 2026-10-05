import { clamp, silentFeatures, type AudioFeatures } from '../shared/config.ts';
export function smooth(previous: number, value: number, dt: number, attack: number, release: number) { return previous + (value - previous) * (1 - Math.exp(-dt / (value > previous ? attack : release))); }
export class FeatureExtractor {
  features = silentFeatures();
  private previous = new Float32Array(0);
  private fluxMean = .002;
  private refractory = 0;
  private lowFluxMean=.004;
  private kickRefractory=0;
  analyze(time: Float32Array, db: Float32Array, sampleRate: number, dt: number): AudioFeatures {
    if (this.previous.length !== db.length) this.previous = new Float32Array(db.length);
    let sq = 0, peak = 0, sum = 0, weighted = 0, flux = 0,lowFlux=0,lowCount=0;
    const bands = [0, 0, 0]; const counts = [0, 0, 0];
    for (const x of time) { sq += x * x; peak = Math.max(peak, Math.abs(x)); }
    for (let i = 1; i < db.length; i++) {
      const magnitude = Number.isFinite(db[i]) ? Math.pow(10, db[i] / 20) : 0;
      const hz = i * sampleRate / (db.length * 2);
      sum += magnitude; weighted += hz * magnitude;
      const change=Math.max(0,magnitude-this.previous[i]);
      flux += change;if(hz>=35&&hz<=180){lowFlux+=change;lowCount++;}this.previous[i] = magnitude;
      const band = hz < 250 ? 0 : hz < 2500 ? 1 : 2;
      if (hz >= 30 && hz <= 16000) { bands[band] += magnitude * magnitude; counts[band]++; }
    }
    flux /= db.length;
    this.refractory -= dt;
    const rawRms = Math.sqrt(sq / Math.max(1, time.length));
    lowFlux/=Math.max(1,lowCount);this.kickRefractory-=dt;
    const rawBass=clamp(Math.sqrt(bands[0]/Math.max(1,counts[0]))*8);
    const kickHit=rawRms>.006&&lowFlux>Math.max(.0015,this.lowFluxMean*2)&&this.kickRefractory<=0;
    this.lowFluxMean=smooth(this.lowFluxMean,lowFlux,dt,1.2,1.2);
    if(kickHit)this.kickRefractory=.2;
    const hit = rawRms > .006 && flux > Math.max(.00008, this.fluxMean * 1.8) && this.refractory <= 0;
    this.fluxMean = smooth(this.fluxMean, flux, dt, 1.5, 1.5);
    if (hit) this.refractory = .12;
    const f = this.features;
    f.rms = smooth(f.rms, clamp(rawRms * 3.3), dt, .035, .45);
    f.peak = smooth(f.peak, clamp(peak), dt, .01, .4);
    f.bass = smooth(f.bass, clamp(Math.sqrt(bands[0] / Math.max(1, counts[0])) * 8), dt, .04, .22);
    f.mid = smooth(f.mid, clamp(Math.sqrt(bands[1] / Math.max(1, counts[1])) * 14), dt, .07, .3);
    f.high = smooth(f.high, clamp(Math.sqrt(bands[2] / Math.max(1, counts[2])) * 24), dt, .05, .2);
    f.centroid = smooth(f.centroid, sum > .001 ? clamp(weighted / sum / 8000) : 0, dt, .5, 1);
    f.flux = smooth(f.flux, clamp(flux * 450), dt, .015, .45);
    f.onset = hit ? 1 : f.onset * Math.exp(-dt / .16);
    f.kick=kickHit?clamp(.25+rawBass*.75):f.kick*Math.exp(-dt/.12);
    return { ...f };
  }
}
