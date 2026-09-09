import { Game, TAU, inGap, gapWidth, tiltSpeed, screenTilt } from './engine.js';
const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
const W=904,H=572,LEFT=271.2,CX=587.6,RX=213,RY=73,INNER=.59,DEPTH=29,CONTACT=61;
const game=new Game();
let started=false,paused=false,last=0,acc=0,raf,raw=null,neutral=null,filtered=0,sensorTime=0,permissionPending=false,drag=null,toast='',toastUntil=0;
const keys=new Set();
const buttons={start:[487,471,201,49],calibrate:[684,25,92,38],restart:[786,25,92,38]};
const ORANGE='#ff922f';
function resize(){const d=Math.min(window.devicePixelRatio||1,3);canvas.width=Math.round(W*d);canvas.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);}
window.addEventListener('resize',resize);resize();
function text(s,x,y,size=16,color='#aeb8c2',align='left',weight=500){ctx.font=`${weight} ${size}px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(s,x,y);}
function round(x,y,w,h,r,fill){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function button(key,label,primary=false){
 const [x,y,w,h]=buttons[key];
 const g=ctx.createLinearGradient(0,y,0,y+h);g.addColorStop(0,primary?'#ffa74b':'#262b31');g.addColorStop(1,primary?'#f08023':'#191e24');
 round(x,y,w,h,primary?7:5,g);ctx.strokeStyle=primary?'#ffb971':'#3d454e';ctx.lineWidth=1;ctx.stroke();
 line(x+7,y+1,x+w-7,y+1,primary?'#ffd1a0':'#515963',.7);
 text(label,x+w/2,y+h/2+6,primary?17:14,primary?'#1c2025':'#d3dae0','center',650);
}
function point(a,r,y,z=0){return [CX+RX*r*Math.cos(a),y+RY*r*Math.sin(a)+z];}
function path(points){ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);ctx.closePath();}
function annulus(y,outer,inner,start,end){
 ctx.beginPath();ctx.ellipse(CX,y,RX*outer,RY*outer,0,start,end);ctx.ellipse(CX,y,RX*inner,RY*inner,0,end,start,true);ctx.closePath();
}
function arc(y,r,start,end,color,width=1){ctx.beginPath();ctx.ellipse(CX,y,RX*r,RY*r,0,start,end);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function cutFaces(start,end,y){
 const faces=[];
 // Viewer is on +Y. Start cut normal is -tangent; end normal is +tangent.
 // A rear opening therefore exposes neither cut face, a front opening both.
 for(const [angle,normalSign] of [[start,-1],[end,1]]){
  if(normalSign*Math.cos(angle)<=1e-6)continue;
  const topA=point(angle,INNER,y),topB=point(angle,1,y);
  const shade=ctx.createLinearGradient(0,Math.min(topA[1],topB[1]),0,Math.max(topA[1],topB[1])+DEPTH);
  shade.addColorStop(0,'#9caab6');shade.addColorStop(.32,'#6a7b89');shade.addColorStop(1,'#26333e');
  // Radial strips allow nearer curved walls to cover only the obscured part.
  for(let i=0;i<16;i++){
   const a=INNER+(1-INNER)*i/16,b=Math.min(1,INNER+(1-INNER)*(i+1)/16+.0005);
   faces.push({sort:(a+b)/2*Math.sin(angle),p:[point(angle,a,y),point(angle,b,y),point(angle,b,y,DEPTH),point(angle,a,y,DEPTH)],fill:shade});
  }
 }
 return faces;
}
function ring(r){
 const y=235+r.y-game.camera-CONTACT;if(y < -180 || y > H+140)return;
 const active=r.n===game.score+1;
 ctx.save();ctx.globalAlpha=r.n<=game.score?.24:active?1:Math.max(.22,.7-(r.n-game.score-2)*.16);
 const start=r.angle+game.rotation+gapWidth(r.n)/2, end=start+TAU-gapWidth(r.n);
 // Stationary light across rotating machined geometry.
 const slices=Math.ceil((end-start)/.055),faces=[];
 for(let i=0;i<slices;i++){
  const a=start+(end-start)*i/slices,b=start+(end-start)*(i+1)/slices+.002,m=(a+b)/2;
  if(Math.sin(m)>0)faces.push({sort:Math.sin(m),p:[point(a,1,y),point(b,1,y),point(b,1,y,DEPTH),point(a,1,y,DEPTH)],inner:false});
  if(Math.sin(m)<0)faces.push({sort:Math.sin(m)*INNER,p:[point(b,INNER,y),point(a,INNER,y),point(a,INNER,y,DEPTH),point(b,INNER,y,DEPTH)],inner:true});
 }
 const wall=ctx.createLinearGradient(0,y-RY,0,y+RY+DEPTH);
 wall.addColorStop(0,'#10161c');wall.addColorStop(.52,'#333e49');wall.addColorStop(.79,'#80909e');wall.addColorStop(.87,'#37424d');wall.addColorStop(.96,'#151c23');wall.addColorStop(1,'#77838e');
 faces.push(...cutFaces(start,end,y));
 // All vertical surfaces are depth-sorted first; the upper annulus occludes them.
 faces.sort((a,b)=>a.sort-b.sort).forEach(f=>{path(f.p);ctx.fillStyle=f.fill??(f.inner?'#1c252e':wall);ctx.fill();});
 // The upper surface is one continuous shape, avoiding polygon seams.
 annulus(y,1,INNER,start,end);
 const metal=ctx.createLinearGradient(CX-100,y-RY,CX+60,y+RY);
 metal.addColorStop(0,'#aebbc5');metal.addColorStop(.24,'#e0e6e9');metal.addColorStop(.42,'#8898a6');metal.addColorStop(.68,'#c7d0d6');metal.addColorStop(.88,'#e7edf0');metal.addColorStop(1,'#8897a4');ctx.fillStyle=metal;ctx.fill();
 // Fine concentric machining lines and recessed track.
 for(const radius of [.65,.68,.71,.74,.77,.80,.83,.86,.89,.92])arc(y,radius,start,end,'rgba(36,48,60,.16)',.6);
 arc(y,.985,start,end,'#edf4f7',1.2);arc(y,.96,start,end,'rgba(27,40,52,.45)',.8);
 arc(y,INNER,start,end,'#eff6f9',1.2);arc(y,INNER+.025,start,end,'#465866',1);
 for(let a=start+.13;a<end-.1;a+=Math.PI/30){
  const large=Math.round((a-start-.13)/(Math.PI/30))%5===0;
  const p=point(a,.94,y),q=point(a,large?.875:.905,y);line(...p,...q,'rgba(29,43,55,.67)',large?1.3:.8);
 }
 for(let i=0;i<4;i++){
  const a=start+.32+i*(end-start-.64)/3,p=point(a,.68,y);
  ctx.beginPath();ctx.ellipse(...p,3.8,1.7,0,0,TAU);ctx.fillStyle='#4e606f';ctx.fill();
  line(p[0]-1.8,p[1],p[0]+1.8,p[1],'#b1c0cb',.7);
 }
 // Orange paint lives only at the opening, so it remains the visual target.
 for(const [a,b] of [[start,start+.07],[end-.07,end]]){annulus(y,.98,INNER+.02,a,b);ctx.fillStyle=ORANGE;ctx.fill();}

 ctx.restore();
}
function ball(){
 const radius=18,y=235+game.ball-game.camera-radius;
 const target=game.rings.find(r=>r.n===game.score+1);
 if(target && !inGap(target,game.rotation)){
  const ground=235+target.y-game.camera,height=Math.max(0,ground-y-radius);
  const shadow=ctx.createRadialGradient(CX,ground,1,CX,ground,27);
  shadow.addColorStop(0,`rgba(0,0,0,${.65*Math.max(.2,1-height/115)})`);shadow.addColorStop(1,'rgba(0,0,0,0)');
  ctx.save();ctx.translate(CX,ground+1);ctx.scale(1,.25);ctx.translate(-CX,-ground);ctx.fillStyle=shadow;ctx.beginPath();ctx.arc(CX,ground,27,0,TAU);ctx.fill();ctx.restore();
 }
 // Brief impact wave stays at the contact point; the steel sphere never deforms.
 if(game.impact>0){
  const age=1-game.impact,ground=235+game.impactY-game.camera;
  ctx.save();ctx.globalAlpha=game.impact*.65;
  ctx.beginPath();ctx.ellipse(CX,ground,6+age*24,2+age*6,0,0,TAU);ctx.strokeStyle='#e9f4ff';ctx.lineWidth=1.3*game.impact;ctx.stroke();
  ctx.globalAlpha=game.impact*game.impact;line(CX-7,ground,CX+7,ground,'#ffffff',1.6);ctx.restore();
 }
 ctx.save();ctx.translate(CX,y);
 const steel=ctx.createLinearGradient(-9,-18,8,18);
 steel.addColorStop(0,'#dce9f1');steel.addColorStop(.19,'#fbfdff');steel.addColorStop(.34,'#9cafbc');steel.addColorStop(.43,'#455868');steel.addColorStop(.48,'#15212c');steel.addColorStop(.56,'#243442');steel.addColorStop(.71,'#758b9c');steel.addColorStop(.84,'#bccbd4');steel.addColorStop(1,'#354653');
 ctx.beginPath();ctx.arc(0,0,radius,0,TAU);ctx.fillStyle=steel;ctx.fill();ctx.save();ctx.clip();
 const edge=ctx.createRadialGradient(-5,-7,4,0,0,19);edge.addColorStop(0,'rgba(255,255,255,0)');edge.addColorStop(.7,'rgba(9,17,24,.04)');edge.addColorStop(1,'rgba(4,11,17,.74)');ctx.fillStyle=edge;ctx.fillRect(-20,-20,40,40);
 ctx.translate(-5,-8);ctx.rotate(-.42);round(-6,-2,15,3,1.5,'rgba(255,255,255,.9)');ctx.restore();
 ctx.beginPath();ctx.arc(0,0,radius-.4,0,TAU);ctx.strokeStyle='rgba(221,239,250,.65)';ctx.lineWidth=.7;ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,16.8,.12,.72);ctx.strokeStyle='rgba(255,161,73,.76)';ctx.lineWidth=1.3;ctx.stroke();ctx.restore();
}
function draw(){
 ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.save();ctx.beginPath();ctx.rect(LEFT,0,W-LEFT,H);ctx.clip();
 const bg=ctx.createRadialGradient(CX,216,30,CX,245,380);bg.addColorStop(0,'#242d36');bg.addColorStop(.65,'#11171d');bg.addColorStop(1,'#080c10');ctx.fillStyle=bg;ctx.fillRect(LEFT,0,W-LEFT,H);
 // Sparse industrial alignment marks, confined to the usable display.
 line(300,100,300,470,'#29323a',.7);line(875,100,875,470,'#29323a',.7);
 for(let y=108;y<470;y+=14){line(300,y,304,y,'#37424b',.7);line(871,y,875,y,'#37424b',.7);}
 for(let i=game.rings.length-1;i>=0;i--)ring(game.rings[i]);
 for(const p of game.particles){ctx.save();ctx.globalAlpha=Math.max(0,p.life/.65)*.6;line(CX+p.x,235+p.y-game.camera,CX+p.x-p.vx*.018,235+p.y-game.camera-p.vy*.018,'#d5e4ef',1);ctx.restore();}
 ball();
 const top=ctx.createLinearGradient(0,0,0,103);top.addColorStop(0,'#0c1117');top.addColorStop(.65,'rgba(12,17,23,.93)');top.addColorStop(1,'rgba(12,17,23,0)');ctx.fillStyle=top;ctx.fillRect(LEFT,0,W-LEFT,103);
 round(299,28,3,19,1,ORANGE);text('轻轻落',312,46,21,'#e9edf0','left',650);text('ALLOY DROP',313,65,11,'#82909e','left',600);
 if(started){text(String(game.score).padStart(2,'0'),609,49,30,'#edf2f5','right',600);text('层',619,48,14,'#7d8a97');button('calibrate','重新校准');button('restart','重新开始');}
 else{text('无限下落',875,45,14,'#a4afb9','right');}
 const bottom=ctx.createLinearGradient(0,started?473:366,0,H);bottom.addColorStop(0,'rgba(10,15,20,0)');bottom.addColorStop(.5,'rgba(10,15,20,.88)');bottom.addColorStop(1,'#0a0f14');ctx.fillStyle=bottom;ctx.fillRect(LEFT,started?473:366,W-LEFT,started?99:206);
 if(!started){
  text('轻倾手机，对准缺口',CX,418,21,'#e5ebef','center',600);text('左右拖动或使用方向键，也可游玩',CX,445,14,'#97a4b1','center');
  button('start',permissionPending?'正在开启…':'开始下落',true);
  line(548,544,565,544,'#596674');text('无终点',CX,549,12,'#8794a0','center');line(610,544,627,544,'#596674');
 }else{
  const sensor=performance.now()-sensorTime<1500&&neutral!==null;const msg=performance.now()<toastUntil?toast:(sensor?'左右轻倾手机 · 回正即停':'左右拖动 / ← → 旋转圆环');
  line(322,513,853,513,'#2c353e',.7);round(326,534,4,4,1,ORANGE);text(msg,CX,542,14,'#a6b2bd','center');
 }
 if(paused&&started){round(500,267,176,56,7,'rgba(17,24,31,.97)');ctx.strokeStyle='#596875';ctx.lineWidth=1;ctx.stroke();text('已暂停',CX,302,20,'#d8e2ea','center');}
 ctx.restore();
}
function message(s){toast=s;toastUntil=performance.now()+2500;}
function calibrate(){if(raw!==null&&performance.now()-sensorTime<1500){neutral=raw;filtered=0;message('已校准当前握姿');}else{neutral=null;message('等待体感信号，可先拖动游玩');}}
window.addEventListener('deviceorientation',e=>{if(e.beta===null||e.gamma===null)return;raw=screenTilt(e.beta,e.gamma,screen.orientation?.angle??window.orientation??0);sensorTime=performance.now();if(neutral===null){neutral=raw;filtered=0;}},true);
screen.orientation?.addEventListener('change',()=>{raw=null;neutral=null;filtered=0;});
async function start(){if(permissionPending)return;permissionPending=true;try{const D=window.DeviceOrientationEvent;if(D&&typeof D.requestPermission==='function'){const result=await D.requestPermission();if(result!=='granted')message('体感未授权，可左右拖动');}}catch{message('体感不可用，可左右拖动');}finally{permissionPending=false;started=true;game.reset();calibrate();canvas.focus();}}
function position(e){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*W/r.width,y:(e.clientY-r.top)*H/r.height};}
function hit(p,b){return p.x>=b[0]&&p.x<=b[0]+b[2]&&p.y>=b[1]&&p.y<=b[1]+b[3];}
canvas.addEventListener('pointerdown',e=>{const p=position(e);if(p.x<LEFT)return;canvas.focus();if(!started){if(hit(p,buttons.start))start();return;}if(hit(p,buttons.calibrate)){calibrate();return;}if(hit(p,buttons.restart)){game.reset();return;}drag={id:e.pointerId,x:p.x};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=position(e);game.rotation+=(p.x-drag.x)*.009;drag.x=p.x;});
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,()=>drag=null);
window.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight',' ','Enter'].includes(e.key))e.preventDefault();keys.add(e.key);if(!started&&(e.key==='Enter'||e.key===' '))start();if(started&&e.key.toLowerCase()==='r')game.reset();if(started&&e.key.toLowerCase()==='c')calibrate();});
window.addEventListener('keyup',e=>keys.delete(e.key));
function pause(){paused=true;keys.clear();drag=null;acc=0;last=0;}
function resume(){if(!document.hidden){paused=false;last=0;acc=0;}}
window.addEventListener('blur',pause);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
function frame(now){const dt=last?Math.min((now-last)/1000,.05):0;last=now;if(started&&!paused){const delta=raw!==null&&neutral!==null?((raw-neutral+540)%360)-180:0;filtered+=(delta-filtered)*(1-Math.exp(-10*dt));let speed=0;if(keys.has('ArrowLeft')||keys.has('ArrowRight'))speed=((keys.has('ArrowRight')?1:0)-(keys.has('ArrowLeft')?1:0))*120*Math.PI/180;else if(!drag&&now-sensorTime<1500)speed=tiltSpeed(filtered);acc+=dt;while(acc>=1/120){game.step(1/120,speed);acc-=1/120;}}else if(!started){const t=(now/1000)%(680/1050);game.ball=-340*t+525*t*t;}draw(now);raf=requestAnimationFrame(frame);}
raf=requestAnimationFrame(frame);
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 for(const tool of [
  {name:'read_game_state',description:'Read current layer count and whether the game is running.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(){return {started,paused,layers:game.score};}},
  {name:'restart_game',description:'Restart the current game and reset the layer count. Start with the visible button first.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false},execute(input){if(!input||Object.keys(input).length)throw new Error('Expected empty input');if(!started)throw new Error('Start the game with the visible button first');game.reset();return {layers:game.score};}}
 ]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
