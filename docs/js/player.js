'use strict';
AFRAME.registerComponent('chirp-player', {
  init() {
    const T=AFRAME.THREE;
    this.keys=new Set();this.ready=false;this.velocityY=0;this.grounded=true;this.accumulator=0;
    this.crouching=false;this.mode='walk';this.moving=false;this.travel=0;
    this.forward=new T.Vector3();this.right=new T.Vector3();this.direction=new T.Vector3();
    this.camera=document.getElementById('camera');
    this.onReady=()=>{this.camera=document.getElementById('camera');this.world=document.getElementById('forest-world').components['chirp-world'];this.ready=true;this.reset();};
    window.addEventListener('chirp-world-ready',this.onReady);
  },
  clear(){this.keys.clear();this.moving=false;this.accumulator=0;},
  reset() {
    if(!this.ready)return;
    const cfg=CHIRP_CONFIG.player,base=cfg.spawn;let chosen=null;
    for(let r=0;r<12&&!chosen;r++)for(let i=0;i<(r?24:1);i++){
      const a=i*Math.PI/12,x=base.x+Math.cos(a)*r*.45,z=base.z+Math.sin(a)*r*.45;
      const y=this.world.floorAt(x,z);
      if(y!==null&&!this.world.collisionAt(x,y+.03,z)){chosen={x,y:y+.03,z};break;}
    }
    if(!chosen){window.dispatchEvent(new CustomEvent('chirp-error',{detail:'入口无法站立，请检查 config.js 的 spawn。'}));return;}
    this.el.object3D.position.set(chosen.x,chosen.y,chosen.z);this.velocityY=0;this.grounded=true;this.clear();
    this.camera.object3D.rotation.set(0,base.yaw,0,'YXZ');
    this.camera.object3D.position.y=cfg.eyeHeight;
    this.crouching=false;
  },
  toggleCrouch() {
  if (!this.ready) return;

  // 站立时，按一下切换为下蹲。
  if (!this.crouching) {
    this.crouching = true;
    return;
  }

  // 下蹲时，先检查头顶是否有足够空间。
  const p = this.el.object3D.position;
  const height = CHIRP_CONFIG.player.height;

  if (this.world.collisionAt(p.x, p.y, p.z, height)) {
    window.ChirpApp?.toast('上方有遮挡，请移动到空旷处再站起。');
    return;
  }

  this.crouching = false;
},
  jump(){if(this.ready&&this.grounded&&!this.crouching){this.velocityY=CHIRP_CONFIG.player.jumpSpeed;this.grounded=false;}},
  look(dx,dy){
    const r=this.camera.object3D.rotation,zoom=window.ChirpApp?.zoom||1;
    const sensitivity=CHIRP_CONFIG.player.mouseSensitivity/Math.sqrt(zoom);
    r.order='YXZ';r.y-=dx*sensitivity;r.x=ChirpCore.clamp(r.x-dy*sensitivity,-Math.PI*.485,Math.PI*.485);r.z=0;
  },
  // 候选位置只有通过脚下与碰撞检测后才会提交，不向历史安全点瞬移。
  attempt(dx,dz,allowSlide=true){
    const p=this.el.object3D.position,cfg=CHIRP_CONFIG.player;
    let x=p.x+dx,z=p.z+dz;
    let floor=this.world.floorAt(x,z,p.y+cfg.stepHeight+.035);
    if(floor===null||p.y-floor>cfg.maxDrop+(this.grounded?0:1.2))return false;
    const stepDown=this.grounded&&p.y-(floor+.03)>.15;
    let y=this.grounded&&!stepDown?floor+.03:p.y;
    const height=this.crouching?cfg.crouchHeight:cfg.height;
    let hit=this.world.collisionAt(x,y,z,height);
    if(hit&&allowSlide){
      const slide=ChirpCore.slide(dx,dz,hit.normal.x,hit.normal.z);
      if(Math.hypot(slide.x,slide.z)>.00001)return this.attempt(slide.x,slide.z,false);
      return false;
    }
    if(hit)return false;
    const len=Math.hypot(dx,dz);
    if(len>0){
      const edge=this.world.floorAt(x+dx/len*cfg.radius*.65,z+dz/len*cfg.radius*.65,y+cfg.stepHeight);
      if(edge===null||y-edge>cfg.maxDrop+(this.grounded?0:1.2))return false;
    }
    p.set(x,y,z);
    if(stepDown){this.grounded=false;this.velocityY=0;}
    return true;
  },
  physics(dt){
    const cfg=CHIRP_CONFIG.player,p=this.el.object3D.position;
    this.mode=this.crouching?'crouch':(this.keys.has('ShiftLeft')||this.keys.has('ShiftRight'))?'run':'walk';
    const yaw=this.camera.object3D.rotation.y;
    this.forward.set(-Math.sin(yaw),0,-Math.cos(yaw));this.right.set(Math.cos(yaw),0,-Math.sin(yaw));
    const f=+(this.keys.has('KeyW')||this.keys.has('ArrowUp'))-+(this.keys.has('KeyS')||this.keys.has('ArrowDown'));
    const s=+(this.keys.has('KeyD')||this.keys.has('ArrowRight'))-+(this.keys.has('KeyA')||this.keys.has('ArrowLeft'));
    this.direction.copy(this.forward).multiplyScalar(f).addScaledVector(this.right,s).normalize();
    const speed=this.mode==='crouch'?cfg.crouchSpeed:this.mode==='run'?cfg.runSpeed:cfg.walkSpeed;
    const oldX=p.x,oldZ=p.z;
    const dx=this.direction.x*speed*dt,dz=this.direction.z*speed*dt;
    if(!this.attempt(dx,dz)){
      // 岸边或两块石头交界处，允许沿尚可通行的轴退开。
      if(Math.abs(dx)>1e-8)this.attempt(dx,0,false);
      if(Math.abs(dz)>1e-8)this.attempt(0,dz,false);
    }
    this.travel+=Math.hypot(p.x-oldX,p.z-oldZ);
    const floor=this.world.floorAt(p.x,p.z,p.y+cfg.stepHeight+.04);
    if(floor!==null){
      if(!this.grounded){
        this.velocityY-=cfg.gravity*dt;
        const next=p.y+this.velocityY*dt;
        if(next<=floor+.03&&this.velocityY<=0){p.y=floor+.03;this.velocityY=0;this.grounded=true;}
        else {
          const hit=this.world.collisionAt(p.x,next,p.z,this.crouching?cfg.crouchHeight:cfg.height);
          if(!hit)p.y=next;
          else if(this.velocityY>0)this.velocityY=0;
          else if(hit.normal.y>.45){p.y=next+hit.normal.y*(hit.depth+.002);this.velocityY=0;this.grounded=true;}
          else { // 沿侧面下落；当前位置不变，下一子步继续解算。
            const push=.002+Math.min(.04,hit.depth),nx=hit.normal.x,nz=hit.normal.z;
            this.attempt(nx*push,nz*push,false);this.velocityY=0;
          }
        }
      }else p.y=floor+.03;
    }
  },
  tick(time,delta){
    if(!this.ready||!window.ChirpApp?.hasControl()){this.moving=false;this.accumulator=0;return;}
    const dt=Math.min((delta||0)/1000,.1),cfg=CHIRP_CONFIG.player;
    this.accumulator+=dt;const before=this.travel;
    let steps=0;while(this.accumulator>=1/90&&steps++<10){this.physics(1/90);this.accumulator-=1/90;}
    this.moving=this.travel-before>.0001;
    const target=this.crouching?cfg.crouchEyeHeight:cfg.eyeHeight;
    this.camera.object3D.position.y+=(target-this.camera.object3D.position.y)*(1-Math.exp(-dt*14));
    if(this.moving)window.ChirpApp.audio?.footsteps(this.travel,this.mode,this.grounded,this.world.surfaceAt(this.el.object3D.position.x,this.el.object3D.position.y,this.el.object3D.position.z));
  },
  remove(){window.removeEventListener('chirp-world-ready',this.onReady);}
});
