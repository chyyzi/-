'use strict';
AFRAME.registerComponent('chirp-birds',{
  init(){
    this.birds=[];this.ready=false;this.clock=0;this.raycaster=new AFRAME.THREE.Raycaster();
    this.worldReady=()=>this.build();window.addEventListener('chirp-world-ready',this.worldReady);
  },
  build(){
    const T=AFRAME.THREE;this.world=document.getElementById('forest-world').components['chirp-world'];
    for(const spec of CHIRP_CONFIG.birds.species){
      const root=new T.Group();root.name='bird-'+spec.id;
      let floor=this.world.floorAt(spec.x,spec.z,100,true);
      // 水边占位球使用水面/岸边高度；正式模型的脚底偏移在配置里调整。
      if(floor===null)floor=0;
      const y=Math.max(floor,0)+spec.heightOffset;
      root.position.set(spec.x,y,spec.z);
      const body=new T.Mesh(new T.SphereGeometry(spec.radius,16,12),new T.MeshStandardMaterial({color:spec.color,roughness:.9,metalness:0}));body.castShadow=true;body.receiveShadow=true;root.add(body);
      const label=this.label(spec.name,spec.color);label.position.y=spec.radius+.5;root.add(label);
      const indicator=this.label('!', '#dba95f', true);indicator.position.y=spec.radius+1.0;indicator.visible=false;root.add(indicator);
      this.el.object3D.add(root);
      const bird={spec,root,body,label,indicator,home:root.position.clone(),state:'idle',alert:0,calmTime:0,stateTime:0,callTimer:7+this.birds.length*4,walkTimer:4+this.birds.length*2,phase:this.birds.length*1.7,flightFrom:new T.Vector3(),flightTo:new T.Vector3(),mixer:null,actions:{},action:null,realModel:null};
      this.birds.push(bird);
      if(spec.model)this.loadModel(bird);
    }
    this.ready=true;
  },
  label(text,color,alert=false){
    const T=AFRAME.THREE,c=document.createElement('canvas');c.width=256;c.height=alert?256:80;
    const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);
    if(alert){ctx.fillStyle='#fff6dbe8';ctx.beginPath();ctx.arc(128,128,89,0,Math.PI*2);ctx.fill();ctx.font='bold 138px sans-serif';ctx.fillStyle='#aa7141';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('!',128,136);}
    else{ctx.fillStyle='#263e32b0';ctx.beginPath();ctx.roundRect(8,9,240,62,18);ctx.fill();ctx.font='32px "Microsoft YaHei",sans-serif';ctx.fillStyle='#fffbe9';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,40);}
    const map=new T.CanvasTexture(c),sprite=new T.Sprite(new T.SpriteMaterial({map,transparent:true,depthTest:true}));
    sprite.scale.set(alert?.47:1.65,alert?.47:.52,1);return sprite;
  },
  loadModel(bird){
    const el=document.createElement('a-entity');el.setAttribute('gltf-model',bird.spec.model);el.object3D.scale.setScalar(bird.spec.modelScale||1);this.el.appendChild(el);
    el.addEventListener('model-loaded',e=>{
      const model=el.getObject3D('mesh');el.removeObject3D('mesh');bird.root.add(model);model.position.y=-bird.spec.radius;model.scale.setScalar(bird.spec.modelScale||1);
      model.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});bird.body.visible=false;bird.realModel=model;
      const animations=model.animations||e.detail.model.animations||[];
      bird.mixer=new AFRAME.THREE.AnimationMixer(model);
      for(const clip of animations)bird.actions[clip.name]=bird.mixer.clipAction(clip);
      this.playClip(bird,bird.state);el.remove();
    });
    el.addEventListener('model-error',()=>{console.warn('鸟类模型加载失败，继续使用占位球',bird.spec.model);el.remove();});
  },
  playClip(bird,state){
    if(!bird.mixer)return;
    const clipName=bird.spec.clips[state];const next=bird.actions[clipName]||bird.actions[bird.spec.clips.idle];
    if(!next||next===bird.action)return;
    const once=['look','alert','friendly','call','flee'].includes(state),T=AFRAME.THREE;
    next.reset();next.setLoop(once?T.LoopOnce:T.LoopRepeat,once?1:Infinity);next.clampWhenFinished=once;next.fadeIn(.2);next.play();if(bird.action)bird.action.fadeOut(.2);bird.action=next;
  },
  setState(bird,state){
    if(bird.state===state)return;
    bird.state=state;bird.stateTime=0;this.playClip(bird,state);
    this.el.emit('bird-state',{id:bird.spec.id,state,alert:bird.alert},false);
    if(state==='call'){
      const app=window.ChirpApp;
      if(app){const distance=bird.root.position.distanceTo(app.player.el.object3D.position);if(distance<25)app.audio?.bird(bird.spec.call);}
      this.el.emit('bird-call',{id:bird.spec.id,file:bird.spec.call},false);
    }
  },
  lineOfSight(from,to){
    const dir=new AFRAME.THREE.Vector3().subVectors(to,from),distance=dir.length();
    if(distance<.1)return true;
    this.raycaster.set(from,dir.normalize());this.raycaster.near=.1;this.raycaster.far=Math.max(.1,distance-.2);
    const hit=this.raycaster.intersectObjects(this.world.occluders,false);
    return !hit.length;
  },
  targets(camera){
    if(!this.ready)return [];
    const T=AFRAME.THREE,origin=camera.getWorldPosition(new T.Vector3());
    camera.updateMatrixWorld();
    return this.birds.filter(b=>{
      if(!b.root.visible||['flee','hidden'].includes(b.state))return false;
      const pos=b.root.getWorldPosition(new T.Vector3()),projected=pos.clone().project(camera);
      return Math.abs(projected.x)<.9&&Math.abs(projected.y)<.86&&projected.z>-1&&projected.z<1&&pos.distanceTo(origin)<CHIRP_CONFIG.birds.photoDistance&&this.lineOfSight(origin,pos);
    });
  },
  flee(bird,player){
    const T=AFRAME.THREE,dir=new T.Vector3().subVectors(bird.root.position,player);dir.y=0;if(dir.lengthSq()<.01)dir.set(1,0,1);dir.normalize();
    bird.flightFrom.copy(bird.root.position);bird.flightTo.copy(bird.root.position).addScaledVector(dir,7);bird.flightTo.y+=4.5;
    this.setState(bird,'flee');window.ChirpApp?.toast(bird.spec.name+'受惊离开了，放轻脚步，稍后再来。');
  },
  reset(){for(const b of this.birds){b.root.position.copy(b.home);b.root.visible=true;b.body.scale.setScalar(1);b.alert=0;b.calmTime=0;this.setState(b,'idle');}},
  tick(time,delta){
    if(!this.ready||!window.ChirpApp?.hasControl())return;
    const dt=Math.min((delta||0)/1000,.06),app=ChirpApp,cfg=CHIRP_CONFIG.birds,T=AFRAME.THREE;
    this.clock+=dt;
    const player=app.player.el.object3D.position,eye=app.camera.getWorldPosition(new T.Vector3());
    for(const b of this.birds){
      b.stateTime+=dt;b.mixer?.update(dt);
      if(b.state==='hidden'){
        if(b.stateTime>cfg.returnAfterSeconds){b.root.position.copy(b.home);b.root.visible=true;b.alert=0;b.calmTime=0;this.setState(b,'idle');}
        continue;
      }
      if(b.state==='flee'){
        const t=ChirpCore.clamp(b.stateTime/cfg.escapeSeconds,0,1);b.root.position.lerpVectors(b.flightFrom,b.flightTo,t);b.body.scale.set(1+.06*Math.sin(t*50),1-.06*Math.sin(t*50),1);b.indicator.visible=t<.25;
        if(t>=1){b.root.visible=false;b.body.scale.setScalar(1);this.setState(b,'hidden');}continue;
      }
      const distance=Math.hypot(b.root.position.x-player.x,b.root.position.z-player.z);
      // 检测每 0.15 秒更新一次，避免每帧扫描全部树石。
      if(this.clock-(b.lastSense||-1)>.15){b.lastSense=this.clock;b.seesPlayer=distance<cfg.noticeDistance&&this.lineOfSight(eye,b.root.position);}
      b.alert=ChirpCore.alertAfterStep(b.alert,{distance,mode:app.player.mode,moving:app.player.moving,visible:b.seesPlayer,dt},cfg);
      if(distance<cfg.noticeDistance&&b.seesPlayer&&b.alert<cfg.alertThreshold&&(!app.player.moving||app.player.mode==='crouch'))b.calmTime+=dt;else b.calmTime=Math.max(0,b.calmTime-dt);
      let desired=ChirpCore.birdState(b.alert,distance,b.calmTime,cfg);
      if(desired==='flee'){this.flee(b,player);continue;}
      b.callTimer-=dt;b.walkTimer-=dt;
      if(desired==='idle'&&b.callTimer<=0){this.setState(b,'call');b.callTimer=14+Math.random()*10;}
      else if(desired==='idle'&&b.walkTimer<=0&&!b.spec.perch){this.setState(b,'walk');b.walkTimer=10+Math.random()*6;}
      else if(!(['call','walk'].includes(b.state)&&b.stateTime<2&&desired==='idle'))this.setState(b,desired);
      b.indicator.visible=b.state==='alert';b.indicator.position.y=b.spec.radius+1+Math.sin(this.clock*5)*.035;
      b.label.visible=distance<18;
      b.body.scale.set(1,1+Math.sin(this.clock*1.9+b.phase)*.035,1);
      if(b.state==='look'||b.state==='friendly'||b.state==='alert')b.root.rotation.y=Math.atan2(player.x-b.root.position.x,player.z-b.root.position.z);
      if(b.state==='walk'){
        const nx=b.home.x+Math.sin(b.stateTime*1.4)*.6,nz=b.home.z+Math.sin(b.stateTime*.8)*.3;
        const floor=this.world.floorAt(nx,nz,100,true);
        if(floor!==null&&!this.world.collisionAt(nx,Math.max(floor,0)+.02,nz,.7)){b.root.position.x=nx;b.root.position.z=nz;b.root.position.y=Math.max(0,floor)+b.spec.heightOffset+Math.abs(Math.sin(b.stateTime*12))*.035;}
      }else if(!b.spec.perch){b.root.position.lerp(b.home,1-Math.exp(-dt*2));}
      if(b.state==='friendly')b.body.rotation.z=Math.sin(b.stateTime*2)*.09;else if(b.state==='call')b.body.rotation.x=-.16*Math.sin(Math.min(1,b.stateTime)*Math.PI);else{b.body.rotation.z*=.9;b.body.rotation.x*=.9;}
    }
  },
  remove(){window.removeEventListener('chirp-world-ready',this.worldReady);for(const b of this.birds)b.mixer?.stopAllAction();}
});
