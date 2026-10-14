'use strict';
AFRAME.registerComponent('chirp-world', {
  init() {
    this.ready = false;
    this.el.addEventListener('model-loaded', () => {
      window.dispatchEvent(new CustomEvent('chirp-loading', {detail: '场景已载入，正在整理地形…'}));
      setTimeout(() => { try { this.build(); } catch (e) { console.error(e); window.dispatchEvent(new CustomEvent('chirp-error', {detail: '场景初始化失败，请查看控制台。'})); } }, 30);
    });
    this.el.addEventListener('model-error', () => window.dispatchEvent(new CustomEvent('chirp-error', {detail: '模型没有载入。请用 Live Server 打开项目根目录的 index.html。'})));
  },
  build() {
    const T = AFRAME.THREE, root = this.el.getObject3D('mesh');
    this.floorTree = new ChirpCollision.Octree();
    this.rockFloorTree = new ChirpCollision.Octree();
    this.waterTree = new ChirpCollision.Octree();
    this.obstacleTree = new ChirpCollision.Octree();
    this.bounds = new T.Box3(); this.waterBounds = new T.Box3();
    this.ray = new T.Ray(); this.normal = new T.Vector3(); this.capsule = new ChirpCollision.Capsule();
    this.floorMeshes = []; this.blockers = []; this.occluders = []; this.deckBounds = [];
    root.updateWorldMatrix(true, true);
    const materialCache = new Map(); let meshCount=0;
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      meshCount++;
      const owner = chirpOwner(mesh, root), name = owner.name;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const foliage = mats.every(m => /Foliage/i.test(m.name));
      const tree = /^tree-/.test(name) && !foliage;
      const rock = /^(rock-|ground-rocks-|moss-)/.test(name);
      const floor = ChirpNames.floor.test(name), water = ChirpNames.water.test(name);
      const rail = ChirpNames.rail.test(name);
      if (floor) { chirpAddTriangles(this.floorTree, mesh); this.floorMeshes.push(mesh); this.bounds.expandByObject(mesh); }
      if (rock) chirpAddTriangles(this.rockFloorTree, mesh,Math.cos(CHIRP_CONFIG.player.maxSlope*Math.PI/180));
      if (water) { chirpAddTriangles(this.waterTree, mesh); this.waterBounds.expandByObject(mesh); }
      if (tree || rock || rail) { chirpAddTriangles(this.obstacleTree, mesh); this.blockers.push(mesh); }
      if (tree || rock || rail || floor || (/^tree-/.test(name) && foliage)) this.occluders.push(mesh);
      if (/^Deck_/.test(name)) this.deckBounds.push(new T.Box3().setFromObject(mesh));
      mesh.receiveShadow = true;
      mesh.castShadow = tree || rock || rail || /^tree-/.test(name);
      // 不改模型的基础颜色、贴图或粗糙度。复用数值相同的材质减少资源占用。
      const mapped = mats.map(m => {
        const key = [m.type, m.name.replace(/\.\d+$/, ''), m.color?.getHex(), m.map?.uuid,
          m.roughness, m.roughnessMap?.uuid, m.metalness, m.metalnessMap?.uuid, m.opacity,
          m.alphaTest, m.transparent, m.side, m.emissive?.getHex(), m.emissiveIntensity,
          m.specularIntensity, m.ior, m.normalMap?.uuid, m.userData.chirpWindKind,
          m.vertexColors, m.normalScale?.toArray(), m.emissiveMap?.uuid, m.alphaMap?.uuid,
          m.clearcoat, m.transmission, m.thickness].join('|');
        if (materialCache.has(key)) return materialCache.get(key);
        materialCache.set(key, m); return m;
      });
      mesh.material = Array.isArray(mesh.material) ? mapped : mapped[0];
    });
    if (!this.floorMeshes.length) throw new Error('未识别到 Terrain / Path / Deck 地形。');
    this.floorTree.build(); this.rockFloorTree.build(); this.waterTree.build(); this.obstacleTree.build();
    this.ready = true;
    const batching=this.batchStaticMeshes(root);
    this.stats = {meshes: meshCount, floors: this.floorMeshes.length, blockers: this.blockers.length, materials: materialCache.size,...batching};
    this.applyEnvironment('normal');
    window.dispatchEvent(new CustomEvent('chirp-world-ready', {detail: this.stats}));
  },
  batchStaticMeshes(root){
    const T=AFRAME.THREE,groups=new Map();
    root.traverse(mesh=>{
      if(!mesh.isMesh||mesh.isSkinnedMesh||Array.isArray(mesh.material)||mesh.morphTargetInfluences?.length||mesh.matrixWorld.determinant()<0)return;
      if(/^waterplant-/.test(chirpOwner(mesh,root).name))return; // 荷叶保持独立浮动。
      const key=[mesh.geometry.uuid,mesh.material.uuid,mesh.castShadow,mesh.receiveShadow].join('|');
      if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);
    });
    const batched=new T.Group();batched.name='chirp-static-instances';
    this.el.sceneEl.object3D.add(batched);let savedDrawCalls=0,instanceBatches=0;
    for(const list of groups.values()){
      if(list.length<3)continue;
      const first=list[0],inst=new T.InstancedMesh(first.geometry,first.material,list.length);
      inst.name='batch-'+first.name;inst.castShadow=first.castShadow;inst.receiveShadow=first.receiveShadow;
      list.forEach((mesh,i)=>{inst.setMatrixAt(i,mesh.matrixWorld);mesh.visible=false;});
      inst.instanceMatrix.needsUpdate=true;inst.computeBoundingSphere();batched.add(inst);
      savedDrawCalls+=list.length-1;instanceBatches++;
    }
    this.batched=batched;
    return {instanceBatches,savedDrawCalls};
  },
  floorAt(x, z, upper = 100, ignoreWater = false) {
    if (!this.ready || x < this.bounds.min.x+.3 || x > this.bounds.max.x-.3 || z < this.bounds.min.z+.3 || z > this.bounds.max.z-.3) return null;
    this.ray.origin.set(x, upper, z); this.ray.direction.set(0,-1,0);
    let hit = this.floorTree.rayIntersect(this.ray);
    const rock = this.rockFloorTree.rayIntersect(this.ray);
    if (rock && (!hit || rock.position.y > hit.position.y)) {
      rock.triangle.getNormal(this.normal);
      if(this.normal.y >= Math.cos(CHIRP_CONFIG.player.maxSlope*Math.PI/180)) hit=rock;
    }
    if (!hit) return null;
    hit.triangle.getNormal(this.normal);
    if (this.normal.y < Math.cos(CHIRP_CONFIG.player.maxSlope*Math.PI/180)) return null;
    if (!ignoreWater && !this.waterBounds.isEmpty()) {
      this.ray.origin.y=100;
      const water = this.waterTree.rayIntersect(this.ray);
      if (water && water.position.y > hit.position.y+.035) return null;
    }
    return hit.position.y;
  },
  collisionAt(x, y, z, height = CHIRP_CONFIG.player.height) {
    const r=CHIRP_CONFIG.player.radius;
    this.capsule.set(this.capsule.start.set(x,y+r,z),this.capsule.end.set(x,y+height-r,z),r);
    const hit=this.obstacleTree.capsuleIntersect(this.capsule);
    return hit && hit.depth > .0015 ? hit : null;
  },
  surfaceAt(x,y,z) {
    return this.deckBounds.some(b => x>b.min.x-.05 && x<b.max.x+.05 && z>b.min.z-.05 && z<b.max.z+.05 && Math.abs(y-b.max.y)<.25) ? 'wood' : 'grass';
  },
  waterDistance(p) {
    if (this.waterBounds.isEmpty()) return 100;
    const b=this.waterBounds;
    return Math.hypot(Math.max(b.min.x-p.x,0,p.x-b.max.x),Math.max(b.min.z-p.z,0,p.z-b.max.z));
  },
  applyEnvironment(name) {
    const cfg=CHIRP_CONFIG.environments[name];
    if (!cfg) return false;
// 未完成的结局沿用普通结局灯光，同时允许单独设置天空。
const env = {
  ...(CHIRP_CONFIG.environments[cfg.inherit || 'normal'] || {}),
  ...cfg
};
    const scene=this.el.sceneEl,T=AFRAME.THREE;
// 切换时先显示备用底色，并释放上一张天空贴图。
const previousBackground = scene.object3D.background;
scene.object3D.background = new T.Color(env.sky);

if (previousBackground?.isTexture) {
  previousBackground.dispose();
}

// 防止快速切换结局时，旧图片覆盖新图片。
const requestId = (this.skyRequestId || 0) + 1;
this.skyRequestId = requestId;

if (env.skyTexture) {
  new T.TextureLoader().load(
    env.skyTexture,
    texture => {
      if (requestId !== this.skyRequestId) {
        texture.dispose();
        return;
      }

      texture.colorSpace = T.SRGBColorSpace;
      texture.mapping = T.EquirectangularReflectionMapping;
      scene.object3D.background = texture;
    },
    undefined,
    error => {
      console.warn('天空图片加载失败：', env.skyTexture, error);
    }
  );
}
    scene.object3D.fog=new T.Fog(env.fog,env.fogNear,env.fogFar);
    if (!this.lights) {
      const hemi=new T.HemisphereLight(env.hemiSky,env.hemiGround,env.hemiIntensity);
      const sun=new T.DirectionalLight(env.sun,env.sunIntensity);
      sun.position.set(-30,65,30);sun.target.position.set(0,0,0);
      sun.castShadow=CHIRP_CONFIG.scene.shadows;
      sun.shadow.mapSize.set(CHIRP_CONFIG.scene.shadowSize,CHIRP_CONFIG.scene.shadowSize);
      Object.assign(sun.shadow.camera,{left:-35,right:35,top:35,bottom:-35,near:1,far:150});
      sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;sun.shadow.radius=3;
      scene.object3D.add(hemi,sun,sun.target);this.lights={hemi,sun};
    }
    this.lights.hemi.color.set(env.hemiSky);this.lights.hemi.groundColor.set(env.hemiGround);this.lights.hemi.intensity=env.hemiIntensity;
    this.lights.sun.color.set(env.sun);this.lights.sun.intensity=env.sunIntensity;
    if(scene.renderer){scene.renderer.toneMapping=T.ACESFilmicToneMapping;scene.renderer.toneMappingExposure=env.exposure;scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,CHIRP_CONFIG.scene.pixelRatio));}
    this.environment=name;
    return cfg.ready;
  },
  tick(time) {
    if(!this.lights || !window.ChirpApp?.player)return;
    if(time-(this.lastShadowUpdate||0)<180)return;
    this.lastShadowUpdate=time;
    const p=ChirpApp.player.el.object3D.position,s=this.lights.sun;
    const x=Math.round(p.x/3)*3,z=Math.round(p.z/3)*3;
    s.position.set(x-30,65,z+30);s.target.position.set(x,0,z);s.target.updateMatrixWorld();
  }
});
