/**
 * 音效管理器 - 不依赖外部文件（Web Audio API 现生成）
 * ----------------------------------------------------------------
 * 4 种音效：correct / wrong / click / levelup
 * 1 个开关（从 localStorage 读 + 自动保存）
 */
(function (global) {
  'use strict';

  const Audio = {
    _ctx: null,
    _enabled: true,
    _initialized: false,

    init: function () {
      if (this._initialized) return;
      this._initialized = true;
      const stored = localStorage.getItem('audio_enabled');
      this._enabled = stored === null ? true : stored === '1';
    },

    // 第一次用户操作时创建 AudioContext（浏览器策略要求）
    _ensureContext: function () {
      if (!this._ctx) {
        try {
          this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
          this._enabled = false;
        }
      }
      if (this._ctx && this._ctx.state === 'suspended') {
        this._ctx.resume();
      }
    },

    isEnabled: function () { return this._enabled; },
    setEnabled: function (on) {
      this._enabled = !!on;
      localStorage.setItem('audio_enabled', on ? '1' : '0');
    },
    toggle: function () { this.setEnabled(!this._enabled); return this._enabled; },

    // 通用 beep
    _beep: function (freq, duration, type, vol) {
      if (!this._enabled) return;
      this._ensureContext();
      if (!this._ctx) return;
      const osc = this._ctx.createOscillator();
      const gain = this._ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol || 0.15, this._ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this._ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this._ctx.destination);
      osc.start();
      osc.stop(this._ctx.currentTime + duration);
    },

    // 4 种音效
    correct: function () {
      // 上行三连音 C5-E5-G5
      this._beep(523, 0.1, 'sine', 0.12);
      setTimeout(() => this._beep(659, 0.1, 'sine', 0.12), 80);
      setTimeout(() => this._beep(784, 0.15, 'sine', 0.15), 160);
    },

    wrong: function () {
      // 下行二音 E4-C4
      this._beep(330, 0.15, 'square', 0.08);
      setTimeout(() => this._beep(262, 0.2, 'square', 0.08), 120);
    },

    click: function () {
      this._beep(880, 0.04, 'sine', 0.06);
    },

    levelup: function () {
      // 上升琶音 C5-E5-G5-C6
      const notes = [523, 659, 784, 1047];
      notes.forEach((n, i) => {
        setTimeout(() => this._beep(n, 0.15, 'triangle', 0.12), i * 80);
      });
    },

    // 关卡完成
    chapterComplete: function () {
      [523, 659, 784, 1047, 1319].forEach((n, i) => {
        setTimeout(() => this._beep(n, 0.2, 'sine', 0.15), i * 100);
      });
    }
  };

  global.AudioMgr = Audio;
})(window);
