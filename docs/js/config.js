/* 《啾，在那里！》集中设置。保存后刷新页面即可生效。
 * 音量范围 0～1；坐标使用 GLB / 网页坐标：X 左右，Y 高度，Z 前后。
 * Blender 坐标换算：网页 X = Blender X，网页 Y = Blender Z，网页 Z = -Blender Y。
 */
window.CHIRP_CONFIG = {
  version: '2026.10.14',
  scene: { model: 'assets/model/Final%20Overall%20scene.glb', pixelRatio: 1.5, shadows: true, shadowSize: 2048 },
  player: {
    spawn: { x: 4, z: 36, yaw: 0 },
    walkSpeed: 3.3, runSpeed: 6.0, crouchSpeed: 1.15,
    height: 1.72, eyeHeight: 1.6, crouchHeight: 1.04, crouchEyeHeight: 0.9,
    radius: 0.28, stepHeight: 0.38, maxDrop: 3.0, maxSlope: 55,
    jumpSpeed: 4.5, gravity: 14, mouseSensitivity: 0.0021
  },
  camera: { fov: 70, minZoom: 1, maxZoom: 4, zoomSpeed: 0.0015, photoWidth: 1920, maxPhotos: 60, shotCooldown: 0.55 },
  audio: {
    // 最常修改这里：0 静音、0.3 为 30%、1 为原始最大音量。
    master: 0.75, music: 0.18, wind: 0.28, water: 0.34,
    walk: 0.42, run: 0.58, crouch: 0.16, shutter: 0.42, bird: 0.65,
    waterNear: 5, waterFar: 30,
    files: { music: 'bgm_forest.ogg', wind: 'wind_leaves_loop.ogg', water: 'water_lake_loop.ogg', shutter: 'camera_shutter.wav' },
    grassSteps: ['footstep_grass_000.ogg','footstep_grass_001.ogg','footstep_grass_002.ogg','footstep_grass_003.ogg','footstep_grass_004.ogg'],
    woodSteps: ['footstep_wood_000.ogg','footstep_wood_001.ogg','footstep_wood_002.ogg','footstep_wood_003.ogg','footstep_wood_004.ogg']
  },
  nature: { wind: true, strength: 0.8 },
  handbook: { firstHintSeconds: 8 },
  birds: {
    noticeDistance: 11, dangerDistance: 7, photoDistance: 24,
    sprintAlertPerSecond: 90, walkAlertPerSecond: 8, crouchAlertPerSecond: 0,
    calmPerSecond: 14, alertThreshold: 35, fleeThreshold: 100,
    escapeSeconds: 2.8, returnAfterSeconds: 35, friendlySeconds: 5,
    // model 留空即使用占位球；未来填写带动画 GLB 路径即可替换。
    // call 留空不会播放假鸟鸣；在这里补对应音频文件路径。
    species: [
      { id: 'heron', name: '夜鹭', english: 'Black-crowned night heron', color: '#78b4cb', x: -39.5, z: 7.5, heightOffset: 0.52, radius: 0.48, perch: false, model: '', modelScale: 1, call: '', habitat: '水岸 · 木栈道旁', note: '在水边停一停，蹲下，留给它一点安静。', clips: {idle:'Idle',look:'Look',alert:'Alert',walk:'Walk',friendly:'Friendly',call:'Call',flee:'FlyAway'} },
      { id: 'bulbul', name: '红耳鹎', english: 'Red-whiskered bulbul', color: '#cf8073', x: 6.8, z: 5.5, heightOffset: 2.3, radius: 0.32, perch: true, model: '', modelScale: 1, call: '', habitat: '林间 · 枝头附近', note: '抬头寻找枝头的身影，用变焦保持观察距离。', clips: {idle:'Idle',look:'Look',alert:'Alert',walk:'Walk',friendly:'Friendly',call:'Call',flee:'FlyAway'} },
      { id: 'dove', name: '珠颈斑鸠', english: 'Spotted dove', color: '#d3b66b', x: 45, z: -3, heightOffset: 0.4, radius: 0.36, perch: false, model: '', modelScale: 1, call: '', habitat: '高地 · 路边石块旁', note: '沿右侧小路慢慢上坡，留意地面的小小动静。', clips: {idle:'Idle',look:'Look',alert:'Alert',walk:'Walk',friendly:'Peck',call:'Call',flee:'FlyAway'} }
    ]
  },
  environments: {
normal: {
  ready: true,
  skyTexture: 'assets/images/sky1.png',
  sky: '#d6e7e2', fog: '#d6e7e2', fogNear: 55, fogFar: 180, sun: '#fff1d4', sunIntensity: 2.0, hemiSky: '#ddecf0', hemiGround: '#9caa79', hemiIntensity: 1.65, exposure: 1.1 },
    good: { ready: false, inherit: 'normal' },
    bad: { ready: false, inherit: 'normal' }
  }
};
