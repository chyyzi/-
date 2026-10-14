// 动态只改网页显示，不修改 GLB 文件，也不改变树干碰撞。
AFRAME.registerComponent('gentle-nature', {
  schema: {enabled:{default:true}, strength:{default:1}},
  init: function() {
    this.time={value:0}; this.strength={value:1}; this.elapsed=0;
    this.originals=[]; this.materials=new Map(); this.geometries=new Map(); this.floaters=[];
    this.loaded=()=>this.setup();
    this.el.addEventListener('model-loaded',this.loaded);
    if(this.el.getObject3D('mesh')) this.setup();
  },
  setup: function() {
    this.restore();
    const root=this.el.getObject3D('mesh'); if(!root)return;
    root.traverse(mesh=>{
      if(!mesh.isMesh || Array.isArray(mesh.material))return;
      const owner=chirpOwner(mesh,root), name=owner.name;
      let kind=null;
      if(ChirpNames.tree.test(name) && ChirpNames.foliage.test(mesh.material.name)) kind='leaf';
      else if(/^(grass-|flower-)/.test(name))kind='grass';
      else if(/^bush-/.test(name))kind='bush';
      // 水生植物整体轻微浮动，根部和叶片保持在一起。
      if(!kind)return;
      const originalGeometry=mesh.geometry, originalMaterial=mesh.material;
      const gkey=originalGeometry.uuid+kind;
      let geometry=this.geometries.get(gkey);
      if(!geometry) {
        geometry=originalGeometry.clone();geometry.computeBoundingBox();
        const attr=geometry.attributes.position, box=geometry.boundingBox;
        const height=Math.max(.01,box.max.y-box.min.y), weights=new Float32Array(attr.count);
        for(let i=0;i<attr.count;i++) {
          const h=Math.max(0,Math.min(1,(attr.getY(i)-box.min.y)/height));
          weights[i]=kind==='leaf' ? .3+.7*h : h*h;
        }
        geometry.setAttribute('chirpWindWeight',new AFRAME.THREE.BufferAttribute(weights,1));
        this.geometries.set(gkey,geometry);
      }
      const mkey=originalMaterial.uuid+kind;
      let material=this.materials.get(mkey);
      if(!material) {
        material=originalMaterial.clone();
        const amplitude=kind==='leaf'?.07:kind==='bush'?.055:.045;
        material.onBeforeCompile=shader=>{
          shader.uniforms.chirpTime=this.time;shader.uniforms.chirpStrength=this.strength;
          shader.uniforms.chirpAmplitude={value:amplitude};
          shader.vertexShader='uniform float chirpTime;\nuniform float chirpStrength;\nuniform float chirpAmplitude;\nattribute float chirpWindWeight;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
            mat4 chirpTransform=modelMatrix;
            #ifdef USE_INSTANCING
              chirpTransform=modelMatrix*instanceMatrix;
            #endif
            vec3 chirpWorld=(chirpTransform*vec4(transformed,1.0)).xyz;
            vec3 chirpScale=vec3(length(chirpTransform[0].xyz),length(chirpTransform[1].xyz),length(chirpTransform[2].xyz));
            float chirpPhase=chirpWorld.x*.31+chirpWorld.z*.23;
            float chirpWind=(sin(chirpTime*1.35+chirpPhase)+.28*sin(chirpTime*2.1+chirpPhase*1.7));
            transformed.x+=chirpWind*chirpAmplitude*chirpStrength*chirpWindWeight/max(.001,chirpScale.x);
            transformed.z+=sin(chirpTime*1.1+chirpPhase+.9)*chirpAmplitude*.48*chirpStrength*chirpWindWeight/max(.001,chirpScale.z);
          `);
        };
        material.userData.chirpWindKind=kind;
        material.customProgramCacheKey=()=> 'chirp-gentle-wind-v2-'+kind;
        this.materials.set(mkey,material);
      }
      this.originals.push({mesh,geometry:originalGeometry,material:originalMaterial});
      mesh.geometry=geometry;mesh.material=material;
    });
    root.children.forEach((obj,i)=>{
      if(!/^waterplant-/.test(obj.name))return;
      this.floaters.push({obj,position:obj.position.clone(),rotation:obj.rotation.clone(),phase:i*2.39996});
    });
    this.counts={windMeshes:this.originals.length,waterPlants:this.floaters.length};
  },
  tick: function(time,delta) {
    if(!delta)return;
    this.elapsed+=Math.min(delta,60)/1000;
    this.time.value=this.elapsed;
    this.strength.value=this.data.enabled?this.data.strength:0;
    const s=this.strength.value;
    for(const f of this.floaters) {
      f.obj.position.y=f.position.y+Math.sin(this.elapsed*.85+f.phase)*.015*s;
      f.obj.rotation.x=f.rotation.x+Math.sin(this.elapsed*.65+f.phase)*.003*s;
      f.obj.rotation.z=f.rotation.z+Math.sin(this.elapsed*.75+f.phase+1)*.004*s;
    }
  },
  restore: function() {
    for(const x of this.originals){x.mesh.geometry=x.geometry;x.mesh.material=x.material;}
    for(const f of this.floaters){f.obj.position.copy(f.position);f.obj.rotation.copy(f.rotation);}
    for(const m of this.materials.values())m.dispose();
    for(const g of this.geometries.values())g.dispose();
    this.originals=[];this.floaters=[];this.materials.clear();this.geometries.clear();
  },
  remove: function(){this.el.removeEventListener('model-loaded',this.loaded);this.restore();}
});

