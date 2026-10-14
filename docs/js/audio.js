'use strict';
class ChirpAudio {
  constructor() {
    this.values={};this.buffers=new Map();this.loops={};this.channels={};this.nextStepAt=0;this.lastTravel=0;this.lastStep=-1;
    const saved=ChirpStore.readJSON('chirp-volumes',{});
    for(const key of ['master','music','wind','water','walk','run','crouch','shutter','bird'])this.values[key]=Number.isFinite(saved[key])?ChirpCore.clamp(saved[key],0,1):CHIRP_CONFIG.audio[key];
    this.active=false;
  }
  async start(){
    try{
      if(!this.ctx){
        const AudioContext=window.AudioContext||window.webkitAudioContext;
        if(!AudioContext)return;
        this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);
        for(const k of ['music','wind','water','walk','run','crouch','shutter','bird']){const gain=this.ctx.createGain();gain.connect(this.master);this.channels[k]=gain;}
        this.apply();
        // 初次用户操作即启动 AudioContext；加载音频期间保持游戏可用。
        this.loading=this.loadAssets();
      }
      this.active=true;await this.ctx.resume();this.apply();
    }catch(e){console.warn('音频启动失败',e);window.ChirpApp?.toast('声音暂未启动，请在手册中调节音量后重试。');}
  }
  async buffer(path){
    if(this.buffers.has(path))return this.buffers.get(path);
    const promise=fetch(path).then(r=>{if(!r.ok)throw new Error(path+' '+r.status);return r.arrayBuffer();}).then(b=>this.ctx.decodeAudioData(b));
    this.buffers.set(path,promise);
    try{return await promise;}catch(e){this.buffers.delete(path);throw e;}
  }
  async loadAssets(){
    const files=CHIRP_CONFIG.audio.files;
    const jobs=Object.entries(files).map(async([channel,file])=>{
      const buffer=await this.buffer('assets/audio/'+file);
      if(['music','wind','water'].includes(channel)){
        const source=this.ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(this.channels[channel]);source.start();this.loops[channel]=source;
      }
    });
    jobs.push(...[...CHIRP_CONFIG.audio.grassSteps,...CHIRP_CONFIG.audio.woodSteps].map(f=>this.buffer('assets/audio/'+f)));
    const results=await Promise.allSettled(jobs);
    if(results.some(r=>r.status==='rejected')){console.warn('部分音频未加载',results.filter(r=>r.status==='rejected'));window.ChirpApp?.toast('部分声音加载失败，其他功能可以继续使用。');}
  }
  set(key,value){this.values[key]=ChirpCore.clamp(Number(value),0,1);this.apply();ChirpStore.writeJSON('chirp-volumes',this.values);}
  reset(){for(const key of Object.keys(this.values))this.values[key]=CHIRP_CONFIG.audio[key];ChirpStore.remove('chirp-volumes');this.apply();}
  apply(){
    if(!this.ctx)return;
    const now=this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.active?this.values.master:0,now,.12);
    for(const [k,g] of Object.entries(this.channels))g.gain.setTargetAtTime(this.values[k]*(k==='water'?(this.waterFactor??0):1),now,.12);
  }
  pause(paused){this.active=!paused;this.apply();}
  updateWater(distance){
    this.waterFactor=ChirpCore.waterGain(distance,CHIRP_CONFIG.audio.waterNear,CHIRP_CONFIG.audio.waterFar);
    if(this.ctx)this.channels.water.gain.setTargetAtTime(this.values.water*this.waterFactor,this.ctx.currentTime,.3);
  }
  async oneShot(file,channel,rate=1,pan=0){
    if(!this.ctx||!this.active)return;
    try{
      const buffer=await this.buffer(file);if(!this.active||this.ctx.state!=='running')return;
      const source=this.ctx.createBufferSource();source.buffer=buffer;source.playbackRate.value=rate;
      if(this.ctx.createStereoPanner){const p=this.ctx.createStereoPanner();p.pan.value=ChirpCore.clamp(pan,-1,1);source.connect(p);p.connect(this.channels[channel]);source.onended=()=>{source.disconnect();p.disconnect();};}
      else {source.connect(this.channels[channel]);source.onended=()=>source.disconnect();}
      source.start();
    }catch(e){console.warn('音效未播放',file,e);}
  }
  footsteps(travel,mode,grounded,surface){
    if(travel<this.lastTravel)this.nextStepAt=travel;
    this.lastTravel=travel;
    if(!grounded||travel<this.nextStepAt)return;
    this.nextStepAt=travel+(mode==='run'?1.15:mode==='crouch'?.9:1.45);
    const files=surface==='wood'?CHIRP_CONFIG.audio.woodSteps:CHIRP_CONFIG.audio.grassSteps;
    let index=Math.floor(Math.random()*files.length);if(index===this.lastStep)index=(index+1)%files.length;this.lastStep=index;
    this.oneShot('assets/audio/'+files[index],mode,mode==='run'?1.06:.96+Math.random()*.08);
  }
  shutter(){this.oneShot('assets/audio/'+CHIRP_CONFIG.audio.files.shutter,'shutter');}
  bird(file,pan=0){if(file)this.oneShot(file,'bird',1,pan);}
}
window.ChirpAudio=ChirpAudio;
