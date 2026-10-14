'use strict';
class ChirpApplication {
  constructor(){
    this.scene=document.getElementById('scene');this.cameraEl=document.getElementById('camera');
    this.started=false;this.paused=true;this.modal=null;this.cameraMode=false;this.zoom=1;this.shotBusy=false;this.lastShot=-Infinity;
    this.photos=[];this.unlocked=new Set(ChirpStore.readJSON('chirp-unlocked',[]));this.photoURLs=new Map();this.currentPhoto=null;
    this.audio=new ChirpAudio();this.welcomeShown=false;this.targets=[];this.bindUI();this.restorePhotos();
    window.addEventListener('chirp-loading',e=>this.loading(e.detail));
    window.addEventListener('chirp-error',e=>{this.loading(e.detail);this.toast(e.detail,9000);});
    window.addEventListener('chirp-world-ready',()=>this.worldReady());
    if(this.scene.hasLoaded)this.prepare();else this.scene.addEventListener('loaded',()=>this.prepare(),{once:true});
    this.scene.addEventListener('render-target-loaded',()=>this.bindCanvas(),{once:true});
    this.scene.addEventListener('enter-vr',()=>this.pause());
    this.updateBook();this.createSliders();
    // 一个轻量计时器更新 HUD，不参与移动积分。
    this.hudTimer=setInterval(()=>this.updateHUD(),180);
  }
  $(id){return document.getElementById(id);}
  prepare(){
    this.player=this.$('rig').components['chirp-player'];this.camera=this.cameraEl.getObject3D('camera');
    this.world=this.$('forest-world').components['chirp-world'];this.birdSystem=this.$('birds').components['chirp-birds'];
    this.cameraEl.setAttribute('camera','fov',CHIRP_CONFIG.camera.fov);
    this.$('forest-world').setAttribute('gentle-nature',{enabled:CHIRP_CONFIG.nature.wind,strength:CHIRP_CONFIG.nature.strength});
    this.$('forest-world').setAttribute('gltf-model','url('+CHIRP_CONFIG.scene.model+')');
    this.$('wind-toggle').checked=CHIRP_CONFIG.nature.wind;this.$('shadow-toggle').checked=CHIRP_CONFIG.scene.shadows;
    this.bindCanvas();
    if(location.protocol==='file:')this.loading('请右键 index.html → Open with Live Server，直接双击文件无法加载 GLB。');
  }
  bindCanvas(){
    const canvas=this.scene.canvas;if(!canvas||this.boundCanvas===canvas)return;this.boundCanvas=canvas;
    canvas.addEventListener('mousedown',e=>{
      if(e.button!==0)return;
      if(this.hasControl()){if(this.cameraMode)this.takePhoto();}
      else if(this.started&&!this.modal)this.resume();
    });
    canvas.addEventListener('contextmenu',e=>e.preventDefault());
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.pause();this.toast('图形资源暂时中断，请刷新页面恢复。已存入相册的照片会保留。',12000);});
  }
  worldReady(){
    this.$('start-button').disabled=false;this.$('start-button').textContent='走进湿地 →';this.loading('场景已就绪');
    this.world=this.$('forest-world').components['chirp-world'];this.player=this.$('rig').components['chirp-player'];this.birdSystem=this.$('birds').components['chirp-birds'];
  }
  loading(text){this.$('loading-status').textContent=text;}
  hasControl(){return this.started&&!this.paused&&!this.modal&&!document.hidden&&document.pointerLockElement===this.scene.canvas;}
  async resume(){
    if(!this.world?.ready||this.modal)return;
    this.started=true;this.$('start-screen').hidden=true;this.$('hud').hidden=false;
    this.audio.start(); // 必须与用户点击处于同一操作，避免自动播放限制。
    try{
      if(!this.scene.canvas.requestPointerLock)throw new Error('Pointer Lock 不可用');
      const request=this.scene.canvas.requestPointerLock();if(request?.then)await request;
    }catch(e){this.pause();this.toast('鼠标控制未获允许，请再次点击「继续观察」。建议用电脑浏览器和 Live Server。',6000);}
  }
  pause(){
    this.paused=true;this.player?.clear();this.audio.pause(true);
    if(this.started&&!this.modal)this.$('pause-screen').hidden=false;
    if(document.pointerLockElement)document.exitPointerLock();
  }
  lockChanged(){
    const locked=document.pointerLockElement===this.scene.canvas;
    this.player?.clear();
    if(locked&&!this.modal){
      this.paused=false;this.$('pause-screen').hidden=true;this.audio.pause(false);
      if(!this.welcomeShown&&!ChirpStore.readJSON('chirp-manual-opened',false)){
        this.welcomeShown=true;this.$('welcome-hint').hidden=false;
        this.hintTimer=setTimeout(()=>this.$('welcome-hint').hidden=true,CHIRP_CONFIG.handbook.firstHintSeconds*1000);
      }
    }else{this.paused=true;this.audio.pause(!this.modal||document.hidden);if(this.started&&!this.modal)this.$('pause-screen').hidden=false;}
  }
  openModal(kind){
    if(!this.started)return;
    this.previousFocus=document.activeElement;this.modal=kind;this.player?.clear();this.paused=true;
    this.audio.pause(false);if(document.pointerLockElement)document.exitPointerLock();
    this.$('pause-screen').hidden=true;this.$('manual-modal').hidden=kind!=='manual';this.$('album-modal').hidden=kind!=='album';
    this.$('viewfinder').hidden=true;this.$('crosshair').hidden=true;
    if(kind==='manual'){
      clearTimeout(this.hintTimer);this.$('welcome-hint').hidden=true;ChirpStore.writeJSON('chirp-manual-opened',true);
      this.updateBook();this.$('close-manual').focus();
    }else{this.showAlbum();this.$('close-album').focus();}
  }
  closeModal(resume=true){
    this.modal=null;this.$('manual-modal').hidden=true;this.$('album-modal').hidden=true;
    this.$('viewfinder').hidden=!this.cameraMode;this.$('crosshair').hidden=this.cameraMode;
    this.previousFocus?.focus?.();
    if(resume)this.resume();else this.pause();
  }
  toggleCamera(){
    if(!this.hasControl())return;
    this.cameraMode=!this.cameraMode;
    this.zoom=1;this.setZoom(1);this.$('viewfinder').hidden=!this.cameraMode;this.$('crosshair').hidden=this.cameraMode;
    this.$('hud').classList.toggle('taking-photos',this.cameraMode);
  }
  setZoom(value){
    this.zoom=ChirpCore.clamp(value,CHIRP_CONFIG.camera.minZoom,CHIRP_CONFIG.camera.maxZoom);
    if(this.camera){this.camera.zoom=this.cameraMode?this.zoom:1;this.camera.updateProjectionMatrix();}
    this.$('zoom-value').textContent=this.zoom.toFixed(1)+'×';
    this.$('zoom-fill').style.width=((this.zoom-CHIRP_CONFIG.camera.minZoom)/(CHIRP_CONFIG.camera.maxZoom-CHIRP_CONFIG.camera.minZoom)*100)+'%';
  }
  async toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      else {this.toast('此浏览器未提供网页全屏，可尝试浏览器的 F11。');return;}
    }catch(e){console.warn(e);this.toast('全屏没有成功，请点右上角全屏图标，或使用浏览器 F11。');}
  }
  fullscreenChanged(){
    const full=!!document.fullscreenElement,b=this.$('fullscreen-button');b.setAttribute('aria-pressed',String(full));b.setAttribute('aria-label',full?'退出全屏':'进入全屏');b.title=(full?'退出全屏':'进入全屏')+' · F';
    // 等浏览器完成布局，让取景框、画布与照片宽高保持同步。
    requestAnimationFrame(()=>{this.scene.resize?.();if(this.cameraMode)this.setZoom(this.zoom);});
  }
  bindUI(){
    this.$('start-button').addEventListener('click',()=>this.resume());this.$('resume-button').addEventListener('click',()=>this.resume());
    this.$('manual-button').addEventListener('click',()=>this.openModal('manual'));this.$('pause-manual').addEventListener('click',()=>this.openModal('manual'));
    this.$('close-manual').addEventListener('click',()=>this.closeModal());this.$('manual-resume').addEventListener('click',()=>this.closeModal());
    this.$('album-button').addEventListener('click',()=>this.openModal('album'));this.$('close-album').addEventListener('click',()=>this.closeModal());
    this.$('fullscreen-button').addEventListener('click',()=>this.toggleFullscreen());
    this.$('detail-back').addEventListener('click',()=>this.showAlbum());this.$('delete-photo').addEventListener('click',()=>this.deleteCurrentPhoto());
    document.addEventListener('fullscreenchange',()=>this.fullscreenChanged());
    document.addEventListener('pointerlockchange',()=>this.lockChanged());
    document.addEventListener('pointerlockerror',()=>{this.pause();this.toast('点击「继续观察」重新进入鼠标控制。');});
    document.addEventListener('mousemove',e=>{if(this.hasControl())this.player?.look(e.movementX,e.movementY);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();});window.addEventListener('blur',()=>this.pause());
    window.addEventListener('resize',()=>{if(this.scene.renderer)this.scene.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,CHIRP_CONFIG.scene.pixelRatio));});
    document.addEventListener('keydown',e=>this.keyDown(e));document.addEventListener('keyup',e=>this.player?.keys.delete(e.code));
    window.addEventListener('wheel',e=>{
      if(!this.hasControl()||!this.cameraMode)return;e.preventDefault();
      const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?window.innerHeight:1);
      this.setZoom(ChirpCore.zoomAfterWheel(this.zoom,delta,CHIRP_CONFIG.camera));
    },{passive:false});
    for(const b of document.querySelectorAll('[data-tab]'))b.addEventListener('click',()=>{
      for(const page of document.querySelectorAll('.book-page'))page.hidden=page.id!=='tab-'+b.dataset.tab;
      for(const tab of document.querySelectorAll('[data-tab]')){tab.classList.toggle('active',tab===b);tab.setAttribute('aria-selected',String(tab===b));}
      document.querySelector('.book-right').scrollTop=0;
    });
    this.$('wind-toggle').addEventListener('change',e=>this.$('forest-world').setAttribute('gentle-nature','enabled',e.target.checked));
    this.$('shadow-toggle').addEventListener('change',e=>{if(this.world?.lights){this.world.lights.sun.castShadow=e.target.checked;if(this.scene.renderer)this.scene.renderer.shadowMap.needsUpdate=true;}});
    this.$('reset-volume').addEventListener('click',()=>{this.audio.reset();this.createSliders();this.toast('音量已恢复为 config.js 中的设置。');});
  }
  keyDown(e){
    const editing=['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName);
    if(this.modal&&e.code==='Tab'){
      const dialog=this.$(this.modal+'-modal'),focusables=[...dialog.querySelectorAll('button,a[href],input,summary')].filter(n=>!n.disabled&&n.getClientRects().length);
      if(focusables.length){const first=focusables[0],last=focusables[focusables.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}return;
    }
    if(e.metaKey||e.altKey)return;
    if(e.code==='Escape'){
      if(this.modal){e.preventDefault();this.closeModal(false);}else if(this.started)this.pause();return;
    }
    if(editing)return;
    // 潜伏会按住 Ctrl，游戏拥有鼠标时拦截 Ctrl+W / Ctrl+S 等浏览器快捷键。
    if(!this.hasControl()&&e.ctrlKey)return;
    if(['KeyH','KeyP','KeyF','KeyC','KeyE','KeyR'].includes(e.code)&&!e.repeat){
      e.preventDefault();
      if(e.code==='KeyF'){this.toggleFullscreen();return;}
      if(!this.started)return;
      if(e.code==='KeyH'){this.modal==='manual'?this.closeModal():this.openModal('manual');return;}
      if(e.code==='KeyP'){this.modal==='album'?this.closeModal():this.openModal('album');return;}
      if(e.code==='KeyC'){this.toggleCamera();return;}
      if(e.code==='KeyE'&&this.cameraMode&&this.hasControl()){this.takePhoto();return;}
      if(e.code==='KeyR'&&this.hasControl()){this.player.reset();this.birdSystem.reset();this.toast('回到入口，重新开始观察。');return;}
    }
if (!this.hasControl()) return;

// Ctrl：单次按下切换姿态，长按不重复切换。
if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
  e.preventDefault();

  if (!e.repeat) {
    this.player.toggleCrouch();
  }

  return;
}

// 行走、冲刺和跳跃。
if ([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space'
].includes(e.code)) {
  e.preventDefault();
  this.player.keys.add(e.code);

  if (e.code === 'Space' && !e.repeat) {
    this.player.jump();
  }
}
  }
  createSliders(){
    const host=this.$('volume-settings');host.replaceChildren();
    const names={master:'总音量',music:'配乐',wind:'风与树叶',water:'水声',walk:'行走',run:'跑步',crouch:'潜伏',shutter:'快门',bird:'鸟鸣'};
    for(const [key,title] of Object.entries(names)){
      const label=document.createElement('label');label.className='volume-row';
      const text=document.createElement('span');text.textContent=title;
      const input=document.createElement('input');input.type='range';input.min=0;input.max=1;input.step=.01;input.value=this.audio.values[key];input.setAttribute('aria-label',title);
      const output=document.createElement('output');output.textContent=Math.round(this.audio.values[key]*100);
      input.addEventListener('input',()=>{this.audio.set(key,input.value);output.textContent=Math.round(input.value*100);});label.append(text,input,output);host.append(label);
    }
  }
  updateBook(){
    this.$('unlock-count').textContent=this.unlocked.size;this.$('unlock-progress').style.width=(this.unlocked.size/CHIRP_CONFIG.birds.species.length*100)+'%';
    const list=this.$('bird-checklist');list.replaceChildren();
    for(const spec of CHIRP_CONFIG.birds.species){
      const unlocked=this.unlocked.has(spec.id),row=document.createElement('article');row.className='bird-entry'+(unlocked?'':' locked');
      const token=document.createElement('div');token.className='bird-token';token.style.setProperty('--bird-color',spec.color);token.textContent=unlocked?'✓':'?';
      const info=document.createElement('div'),h=document.createElement('h4'),p=document.createElement('p');h.textContent=spec.name;p.textContent=spec.habitat;info.append(h,p);
      const stamp=document.createElement('span');stamp.className='stamp';stamp.textContent=unlocked?'已记录':'待发现';row.append(token,info,stamp);list.append(row);
    }
  }
  toast(text,duration=3500){clearTimeout(this.toastTimer);this.$('toast').textContent=text;this.$('toast').hidden=false;this.toastTimer=setTimeout(()=>this.$('toast').hidden=true,duration);}
  updateHUD(){
    if(!this.started)return;
    if(this.hasControl()){
      this.$('movement-label').textContent=this.player.crouching?'潜伏观察 · 警觉不增加':this.player.mode==='run'&&this.player.moving?'正在冲刺':'轻步行走';
      this.audio.updateWater(this.world.waterDistance(this.player.el.object3D.position));
      if(this.cameraMode){this.targets=this.birdSystem.targets(this.camera);this.$('focus-readout').textContent=this.targets.length?this.targets.map(b=>b.spec.name).join(' · ')+' · 可记录':'寻找鸟类身影';}
    }
  }
  async restorePhotos(){
    try{this.photos=(await ChirpStore.all()).sort((a,b)=>b.created-a.created);}
    catch(e){console.warn('本地相册不可用',e);this.storageUnavailable=true;}
    this.$('photo-count').textContent=this.photos.length;
  }
  async takePhoto(){
    if(!this.hasControl()||!this.cameraMode||this.shotBusy)return;
    const now=performance.now()/1000,cfg=CHIRP_CONFIG.camera;if(now-this.lastShot<cfg.shotCooldown)return;
    if(this.photos.length>=cfg.maxPhotos){this.toast('相册已满，请打开相册下载并删除部分照片后继续。');return;}
    this.shotBusy=true;this.lastShot=now;
    const targetBirds=this.birdSystem.targets(this.camera),shotZoom=this.zoom,hidden=[];
    try{
      // 将鸟名和警觉提示临时隐藏，仅渲染实际场景。HTML HUD 自然不会被截入。
      for(const b of this.birdSystem.birds)for(const obj of [b.label,b.indicator]){hidden.push([obj,obj.visible]);obj.visible=false;}
      this.scene.renderer.render(this.scene.object3D,this.camera);
      const source=this.scene.renderer.domElement,output=document.createElement('canvas');
      output.width=Math.min(cfg.photoWidth,source.width);output.height=Math.round(output.width*source.height/source.width);
      output.getContext('2d').drawImage(source,0,0,output.width,output.height);
      for(const [obj,visible] of hidden)obj.visible=visible;hidden.length=0;
      const blob=await new Promise(resolve=>output.toBlob(resolve,'image/jpeg',.92));if(!blob)throw new Error('照片导出失败');
      const created=Date.now(),photo={id:window.crypto?.randomUUID?crypto.randomUUID():String(created)+'-'+Math.random().toString(36).slice(2),created,blob,birds:targetBirds.map(b=>b.spec.id),zoom:shotZoom};
      let persistent=true;try{await ChirpStore.put(photo);}catch(e){persistent=false;console.warn(e);}
      this.photos.unshift(photo);this.$('photo-count').textContent=this.photos.length;
      const fresh=targetBirds.filter(b=>!this.unlocked.has(b.spec.id));for(const b of targetBirds)this.unlocked.add(b.spec.id);
      ChirpStore.writeJSON('chirp-unlocked',[...this.unlocked]);this.updateBook();this.audio.shutter();
      this.$('shutter-flash').classList.add('flash');setTimeout(()=>this.$('shutter-flash').classList.remove('flash'),75);
      this.toast(persistent?(fresh.length?'已记录 '+fresh.map(b=>b.spec.name).join('、')+' · 按 P 查看照片':'照片已收入相册 · 按 P 查看'):'照片暂存于本次页面，请立刻按 P 下载；浏览器未能保存相册。',persistent?3500:7000);
    }catch(e){console.error(e);this.toast('拍照失败，请稍后重试；查看控制台可获取具体原因。');}
    finally{for(const [obj,visible] of hidden)obj.visible=visible;this.shotBusy=false;}
  }
  photoURL(photo){if(!this.photoURLs.has(photo.id))this.photoURLs.set(photo.id,URL.createObjectURL(photo.blob));return this.photoURLs.get(photo.id);}
  caption(photo){const names=photo.birds.map(id=>CHIRP_CONFIG.birds.species.find(b=>b.id===id)?.name).filter(Boolean);return(names.join('、')||'湿地风景')+' · '+photo.zoom.toFixed(1)+'× · '+new Date(photo.created).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});}
  showAlbum(){
    this.currentPhoto=null;this.$('photo-detail').hidden=true;this.$('album-grid').hidden=false;
    this.$('album-empty').hidden=this.photos.length>0;this.$('album-count').textContent=this.photos.length+' / '+CHIRP_CONFIG.camera.maxPhotos;
    const grid=this.$('album-grid');grid.replaceChildren();
    for(const photo of this.photos){const button=document.createElement('button');button.className='photo-card';const image=document.createElement('img');image.src=this.photoURL(photo);image.alt=this.caption(photo);image.loading='lazy';const text=document.createElement('span');text.textContent=this.caption(photo);button.append(image,text);button.addEventListener('click',()=>this.showPhoto(photo));grid.append(button);}
  }
  showPhoto(photo){
    this.currentPhoto=photo;this.$('album-grid').hidden=true;this.$('album-empty').hidden=true;this.$('photo-detail').hidden=false;this.$('detail-image').src=this.photoURL(photo);this.$('detail-caption').textContent=this.caption(photo);
    this.$('download-photo').href=this.photoURL(photo);this.$('download-photo').download='啾在那里_'+new Date(photo.created).toISOString().replace(/[:.]/g,'-')+'.jpg';
  }
  async deleteCurrentPhoto(){
    const photo=this.currentPhoto;if(!photo)return;
    try{await ChirpStore.delete(photo.id);}catch(e){console.warn(e);this.toast('本地相册删除失败，请稍后再试。');return;}
    this.photos=this.photos.filter(p=>p.id!==photo.id);URL.revokeObjectURL(this.photoURLs.get(photo.id));this.photoURLs.delete(photo.id);this.$('photo-count').textContent=this.photos.length;this.showAlbum();
  }
}
window.ChirpApp=new ChirpApplication();
