(function (root) {
  'use strict';
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const Core = {
    clamp,
    zoomAfterWheel: (zoom, delta, cfg) => clamp(zoom * Math.exp(-delta * cfg.zoomSpeed), cfg.minZoom, cfg.maxZoom),
    alertAfterStep(value, {distance, mode, moving, visible, dt}, cfg) {
      if (!visible || distance > cfg.dangerDistance || !moving) return clamp(value - cfg.calmPerSecond * dt, 0, 100);
      const rate = mode === 'run' ? cfg.sprintAlertPerSecond : mode === 'crouch' ? cfg.crouchAlertPerSecond : cfg.walkAlertPerSecond;
      return clamp(value + rate * dt, 0, 100);
    },
    slide(dx, dz, nx, nz) {
      const len = Math.hypot(nx, nz);
      if (len < 1e-6) return {x: 0, z: 0};
      nx /= len; nz /= len;
      const into = Math.min(0, dx * nx + dz * nz);
      return {x: dx - into * nx, z: dz - into * nz};
    },
    waterGain(distance, near, far) { return clamp(1 - (distance - near) / Math.max(0.01, far - near), 0, 1); },
    birdState(alert, distance, calmTime, cfg) {
      if (alert >= cfg.fleeThreshold) return 'flee';
      if (alert >= cfg.alertThreshold) return 'alert';
      if (calmTime >= cfg.friendlySeconds) return 'friendly';
      return distance < cfg.noticeDistance ? 'look' : 'idle';
    }
  };
  root.ChirpCore = Core;
  if (typeof module !== 'undefined') module.exports = Core;
})(typeof window !== 'undefined' ? window : globalThis);
