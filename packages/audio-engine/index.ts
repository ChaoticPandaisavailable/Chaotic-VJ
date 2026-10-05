import { FeatureExtractor } from './features.ts';
import { silentFeatures } from '../shared/config.ts';

export class DesktopAudioSource {
  context: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  sourceName = '未连接 · 静音演化';
  private stream: MediaStream | null = null;
  private source: AudioNode | null = null;
  private element: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private extractor = new FeatureExtractor();
  private time = new Float32Array(2048);
  private frequency = new Float32Array(1024);
  private generation = 0;
  onChange = () => {};
  private async prepare() {
    this.context = new AudioContext();
    await this.context.resume();
    this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048; this.analyser.smoothingTimeConstant = 0;
    this.extractor = new FeatureExtractor();
  }
  async desktop() {
    this.stop(); const generation = this.generation;
    if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('当前浏览器不支持桌面捕获。请用 Chrome / Edge 打开 localhost，或先使用本地音乐。');
    const options = { video: { displaySurface: 'monitor', frameRate: 1 }, audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, systemAudio: 'include', selfBrowserSurface: 'exclude', surfaceSwitching: 'exclude' };
    const stream = await navigator.mediaDevices.getDisplayMedia(options);
    if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
    if (!stream.getAudioTracks().length) { stream.getTracks().forEach(t => t.stop()); throw new Error('没有收到系统音频。请选择“整个屏幕”并勾选“共享系统音频”；也可使用本地音乐测试。'); }
    const surface = stream.getVideoTracks()[0]?.getSettings().displaySurface;
    if (surface === 'browser') { stream.getTracks().forEach(t => t.stop()); throw new Error('选中的是浏览器标签页声音，无法代表 VDJ 桌面声音。请重新选择“整个屏幕”。'); }
    this.stream = stream;
    await this.prepare();
    this.source = this.context!.createMediaStreamSource(stream); this.source.connect(this.analyser!);
    // Deliberately no destination connection. The attached video is never displayed, recorded or sent.
    this.sourceName = surface === 'monitor' ? '桌面音频 · 系统声音' : '窗口音频 · 请核对 VDJ Master';
    for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (generation === this.generation) this.stop(); }, { once: true });
    this.onChange();
  }
  async file(file: File | string, name = '本地测试音乐') {
    this.stop(); await this.prepare();
    this.objectUrl = typeof file === 'string' ? null : URL.createObjectURL(file);
    this.element = new Audio(typeof file === 'string' ? file : this.objectUrl!); this.element.loop = true;
    this.source = this.context!.createMediaElementSource(this.element);
    this.source.connect(this.analyser!); this.source.connect(this.context!.destination);
    await this.element.play(); this.sourceName = `本地文件 · ${typeof file === 'string' ? name : file.name}`; this.onChange();
  }
  restartFile() { if (this.element) this.element.currentTime = 0; }
  recordingTap() {
    if (!this.element || !this.context || !this.source) return null;
    const destination = this.context.createMediaStreamDestination();
    const source = this.source; source.connect(destination);
    return { stream: destination.stream, dispose: () => { try { source.disconnect(destination); } catch {} destination.stream.getTracks().forEach(t => t.stop()); } };
  }
  /** A synchronous view of the most recently analysed mono frame; no extra capture or allocation. */
  pcmFrame(){return this.analyser&&this.context?.state==='running'?{samples:this.time,sampleRate:this.context.sampleRate}:null;}
  update(dt: number) {
    if (!this.analyser || this.context?.state !== 'running') return silentFeatures();
    this.analyser.getFloatTimeDomainData(this.time); this.analyser.getFloatFrequencyData(this.frequency);
    return this.extractor.analyze(this.time, this.frequency, this.context.sampleRate, dt);
  }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.source?.disconnect(); this.source = null;
    this.element?.pause(); if (this.element) this.element.src = ''; this.element = null;
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl); this.objectUrl = null;
    void this.context?.close(); this.context = null; this.analyser = null;
    this.sourceName = '未连接 · 静音演化'; this.onChange();
  }
}
