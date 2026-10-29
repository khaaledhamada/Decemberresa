import {MAP,places,roads,railway,duration,itinerary} from './data.js';

const $=id=>document.getElementById(id);
const atlas=$('atlas'),world=$('world'),labels=$('labels'),leaders=$('leaders'),card=$('place-card');
const NS='http://www.w3.org/2000/svg';
const UI='.place-card,.filters,.map-tools,.map-footnote,.journey-strip,.explore-controls';
const pointers=new Map(),labelItems=[],hotspots=[],routePaths=[];
let width=atlas.clientWidth,height=atlas.clientHeight,scale=1,tx=0,ty=0;
let view='route',category='all',selected=null,frame=0,suppressClickUntil=0;
let drag=null,pinch=null,overview=true,currentVisit=null;
const clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
const screen=(x,y)=>({x:tx+x*scale,y:ty+y*scale});
const optional=place=>!place.planned&&place.category!=='transport';
const allowed=place=>!optional(place)||(view==='explore'&&(category==='all'||place.category===category));
const moving=()=>atlas.classList.contains('dragging');

function svg(name,attributes){
  const node=document.createElementNS(NS,name);
  for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
  return node;
}
function requestLayout(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;render();});}

function buildJourney(){
  for(const visit of itinerary){
    const li=document.createElement('li'),button=document.createElement('button');
    button.type='button';button.className='journey-stop';button.dataset.visit=visit.number;
    button.setAttribute('aria-label',`Stopp ${visit.number}: ${visit.name}, ${visit.detail}`);
    const number=document.createElement('span');number.className='ordinal';number.textContent=visit.number;
    const text=document.createElement('span'),name=document.createElement('strong'),detail=document.createElement('small');
    name.textContent=visit.name;detail.textContent=visit.detail;text.append(name,detail);button.append(number,text);
    button.addEventListener('click',()=>focusPlace(places.find(place=>place.id===visit.id),visit.number));
    li.append(button);$('journey-stops').append(li);
  }
}
function updateJourney(){
  document.querySelectorAll('.journey-stop').forEach(button=>{
    if(Number(button.dataset.visit)===currentVisit)button.setAttribute('aria-current','step');
    else button.removeAttribute('aria-current');
  });
}
function buildPlaces(){
  for(const place of places){
    const extra=optional(place);
    const hotspot=document.createElement('button');
    hotspot.type='button';hotspot.tabIndex=-1;hotspot.className='figure-hotspot';hotspot.dataset.place=place.id;
    hotspot.setAttribute('aria-label',`${place.name} · ${place.planned?'vår rutt':extra?'tillval, ingår inte i rutten':'föreslagen tågstation'}`);
    hotspot.addEventListener('click',()=>{if(allowed(place))openCard('place',place);});
    $('figure-hotspots').append(hotspot);hotspots.push({place,node:hotspot});
    const label=document.createElement('button');
    label.type='button';label.className=`place-label ${place.planned?'planned':extra?'optional':'transport'}`;label.dataset.place=place.id;
    label.setAttribute('aria-label',hotspot.getAttribute('aria-label'));
    if(place.number){const number=document.createElement('span');number.className='ordinal';number.textContent=place.number;label.append(number);}
    if(extra){const plus=document.createElement('span');plus.className='extra-symbol';plus.textContent='+';plus.setAttribute('aria-hidden','true');label.append(plus);}
    const copy=document.createElement('span');copy.className='label-copy';copy.textContent=place.labelName||place.name;
    if(place.planned||extra){
      const small=document.createElement('span');small.className='label-subtitle';
      small.textContent=extra?'Tillval · inte i rutten':place.labelSubtitle||place.subtitle;copy.append(small);
    }
    label.append(copy);label.addEventListener('click',()=>{if(allowed(place))openCard('place',place);});labels.append(label);
    labelItems.push({type:'place',data:place,node:label});
  }
}
function buildRoutes(){
  for(const road of [...roads,railway]){
    const train=road.id==='train',group=svg('g',{class:'route-group','data-route':road.id});
    const halo=svg('path',{d:road.path,class:'road-halo'});
    const line=svg('path',{d:road.path,class:train?'rail-path':'road-path'});
    const hit=svg('path',{d:road.path,class:'route-hit'});
    const arrow=svg('path',{d:'M-5 -4 L0 0 L-5 4',class:'route-arrow'});
    group.append(halo,line,arrow,hit);$('routes').append(group);
    hit.addEventListener('click',()=>openCard(train?'train':'road',road));
    const length=line.getTotalLength(),point=line.getPointAtLength(length*.6),next=line.getPointAtLength(length*.6+1);
    const midpoint=line.getPointAtLength(length*.5);
    road.label=[road.x,road.y];road.x=midpoint.x;road.y=midpoint.y;
    routePaths.push({line,halo,arrow,hit,train,group,id:road.id,point,angle:Math.atan2(next.y-point.y,next.x-point.x)*180/Math.PI});
    const button=document.createElement('button');button.type='button';button.className=train?'rail-label':'road-label';button.dataset.route=road.id;
    if(train){button.textContent='Tågförslag · Hatton → Ella';button.setAttribute('aria-label','Föreslagen tågresa: Hatton via Nanu Oya till Ella');}
    else{
      const leg=document.createElement('small'),km=document.createElement('strong'),time=document.createElement('span');
      leg.className='leg-number';leg.textContent=road.leg;
      km.textContent=`${road.km} km`;time.textContent=`ca ${duration(road.minutes)}`;button.append(leg,km,time);
      button.setAttribute('aria-label',`${road.from} till ${road.to}: cirka ${road.km} kilometer, ${duration(road.minutes)} med bil`);
    }
    button.addEventListener('click',()=>openCard(train?'train':'road',road));labels.append(button);
    labelItems.push({type:train?'train':'road',data:road,node:button});
  }
}
function updateView(){
  atlas.classList.toggle('route-view',view==='route');
  atlas.classList.toggle('explore-view',view==='explore');
  document.querySelectorAll('[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));
  document.querySelector('.explore-controls').hidden=view!=='explore';
  $('view-explanation').textContent=view==='route'
    ?'Bara vår rutt är markerad. Övriga målade figurer är tillval.'
    :'Grönt = vår rutt. + Tillval = ingår inte. Zooma för fler namn.';
}
function setView(next,{fit=true}={}){
  closeCard();view=next;category='all';$('extra-category').value='all';updateView();
  if(fit){if(next==='route')fitRoute();else if(width<=700){fitRoute();zoom(1.25);}else fitMap();}
  requestLayout();$('live-status').textContent=next==='route'?'Vår planerade rutt visas. Tillval är dolda.':'Vår rutt och valbara utflykter visas. Tillval ingår inte i resplanen.';
}

function openCard(type,item,visit=null){
  if(type==='place'&&optional(item)&&!allowed(item)){view='explore';category='all';$('extra-category').value='all';updateView();}
  selected={type,data:item};card.classList.toggle('is-extra',type==='place'&&optional(item));
  card.classList.toggle('is-transfer',type==='train'||(type==='place'&&item.category==='transport'));
  $('card-metric').replaceChildren();$('card-metric').hidden=true;
  if(type==='place'){
    $('card-status').textContent=item.planned?`Vår rutt · stopp ${visit||item.number.replace('·',' & ')}`:optional(item)?'Tillval · ingår inte i vår rutt':'Tågstation · föreslagen anslutning';
    $('card-title').textContent=item.name;$('card-subtitle').textContent=item.subtitle;
    $('card-description').textContent=item.description;$('card-note').textContent=item.note;
    if(item.planned)currentVisit=visit||itinerary.find(stop=>stop.id===item.id)?.number;
    else currentVisit=null;
  }else if(type==='road'){
    currentVisit=null;$('card-status').textContent='Vår rutt · bilsträcka';$('card-title').textContent=`${item.from} → ${item.to}`;
    $('card-subtitle').textContent='Ungefärligt avstånd och körtid';
    $('card-description').textContent='Körtiden är en uppskattning utan framtida trafik och pauser. Exakta boenden och utflyktsstopp kan ändra resan.';
    $('card-metric').hidden=false;$('card-metric').textContent=`${item.km} km`;
    const time=document.createElement('small');time.textContent=`Cirka ${duration(item.minutes)} med bil`;$('card-metric').append(time);
    $('card-note').textContent='Vägförslag från OpenStreetMap/OSRM. Dalhousie används vid Adam’s Peak och Tissamaharama som Yala-bas.';
  }else if(type==='train'){
    currentVisit=null;$('card-status').textContent='Tågförslag · mellan stopp 3 och 4';$('card-title').textContent='Hatton → Nanu Oya → Ella';
    $('card-subtitle').textContent='Från Adam’s Peak vidare mot Ella';$('card-description').textContent=railway.description;$('card-note').textContent=railway.note;
  }else{
    currentVisit=null;$('card-status').textContent='Så läser du kartan';$('card-title').textContent='Vår rutt eller ett tillval?';
    $('card-subtitle').textContent=`${places.length} platser och stationer`;
    $('card-description').textContent='Den gröna märkningen med nummer visar vår preliminära rutt: flygplatsen → Sigiriya → Adam’s Peak → Ella → Yala → flygplatsen. Välj Rutt + tillval för att visa andra utflykter. De ljusa, streckade etiketterna med plus ingår inte i rutten. De målade figurerna ligger kvar som bakgrund i båda vyerna.';
    $('card-note').textContent='Schematisk illustrationskarta, inte exakt navigering. Kilometer och körtider är ungefärliga förslag från OpenStreetMap/OSRM utan trafik eller pauser. Tåget från Hatton via Nanu Oya till Ella är ett förslag. Flyg, aktiviteter och tågbiljetter är inte bokningsbekräftade här.';
  }
  card.hidden=false;card.scrollTop=0;updateJourney();requestLayout();
  $('live-status').textContent=`${$('card-status').textContent}. ${$('card-title').textContent}`;
  history.replaceState(null,'',`#${item.id}`);
}
function closeCard(){
  selected=null;currentVisit=null;card.hidden=true;updateJourney();
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  requestLayout();
}
$('close-card').addEventListener('click',closeCard);
$('about-map').addEventListener('click',()=>openCard('about',{id:'about',x:160,y:800}));

function intersect(a,b,padding=4){return a.x<b.x+b.w+padding&&a.x+a.w+padding>b.x&&a.y<b.y+b.h+padding&&a.y+a.h+padding>b.y;}
function elementRect(node){const r=node.getBoundingClientRect();return {x:r.left,y:r.top,w:r.width,h:r.height};}
function fixedObstacles(){
  return [...document.querySelectorAll('.map-title,.filters,.journey-strip,.explore-controls,.map-legend,.map-tools,.map-footnote,.place-card')]
    .filter(node=>!node.hidden).map(node=>{const r=elementRect(node);return {x:r.x-4,y:r.y-4,w:r.w+8,h:r.h+8};});
}
function mapViewport(){
  const topNodes=[...document.querySelectorAll('.map-title,.filters,.journey-strip,.explore-controls')].filter(node=>!node.hidden);
  const top=Math.max(...topNodes.map(node=>node.getBoundingClientRect().bottom))+14;
  const bottom=Math.min(...[...document.querySelectorAll('.map-legend,.map-tools')].map(node=>node.getBoundingClientRect().top))-12;
  return {x:12,y:top,w:Math.max(100,width-24),h:Math.max(100,bottom-top)};
}
function clampCamera(){
  const area=mapViewport(),w=MAP.width*scale,h=MAP.height*scale,pad=36;
  tx=w<=area.w?area.x+(area.w-w)/2:clamp(tx,area.x+area.w-w-pad,area.x+pad);
  ty=h<=area.h?area.y+(area.h-h)/2:clamp(ty,area.y+area.h-h-pad,area.y+pad);
}
function priority(item){
  if(selected?.data.id===item.data.id)return 150;
  if(item.data.planned)return 120;
  if(item.type==='road')return 110;
  if(item.type==='train')return 100;
  return item.data.category==='transport'?40:60;
}
function renderLabels(){
  const sizeKey=width<=700?'mobile':'desktop';
  const toMeasure=labelItems.filter(item=>item.sizeKey!==sizeKey);
  for(const item of toMeasure){item.node.hidden=false;item.node.style.visibility='hidden';}
  for(const item of toMeasure){const box=item.node.getBoundingClientRect();item.size={width:box.width,height:box.height};item.sizeKey=sizeKey;}
  const occupied=fixedObstacles();leaders.replaceChildren();
  for(const item of [...labelItems].sort((a,b)=>priority(b)-priority(a))){
    const {type,data,node}=item,anchor=screen(data.x,data.y),isSelected=selected?.data.id===data.id;
    node.classList.toggle('selected',isSelected);
    const show=type!=='place'||allowed(data);
    const station=type==='place'&&data.category==='transport';
    if(!show||(station&&scale<.56&&!isSelected)||anchor.x<-80||anchor.x>width+80||anchor.y<-80||anchor.y>height+80){node.hidden=true;continue;}
    const w=item.size.width,h=item.size.height;
    const preferred=data.label?screen(...data.label):anchor;
    let chosen=null;
    if(moving()){
      if(item.offset){
        const x=anchor.x+item.offset.x,y=anchor.y+item.offset.y,rect={x:x-w/2,y:y-h/2,w,h};
        if(rect.x>=7&&rect.x+w<=width-7&&rect.y>=7&&rect.y+h<=height-7&&!occupied.some(other=>intersect(rect,other,2)))chosen={x,y,rect};
      }
    }else{
      const candidates=[preferred,{x:anchor.x,y:anchor.y+23+h/2},{x:anchor.x+w/2+14,y:anchor.y},{x:anchor.x-w/2-14,y:anchor.y},{x:anchor.x,y:anchor.y-22-h/2},{x:preferred.x,y:preferred.y+32},{x:preferred.x,y:preferred.y-32},{x:anchor.x+w/2+22,y:anchor.y+25},{x:anchor.x-w/2-22,y:anchor.y+25}];
      for(const candidate of candidates){
        const rect={x:candidate.x-w/2,y:candidate.y-h/2,w,h};
        if(rect.x<7||rect.x+w>width-7||rect.y<7||rect.y+h>height-7)continue;
        if(!occupied.some(other=>intersect(rect,other,4))){chosen={...candidate,rect};break;}
      }
      if(!chosen&&(data.planned||type==='road'||type==='train'||isSelected)){
        search:for(let radius=20;radius<=200;radius+=20){
          for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.5,Math.PI/4,Math.PI*.75,Math.PI*1.25,Math.PI*1.75]){
            const x=preferred.x+Math.cos(angle)*radius,y=preferred.y+Math.sin(angle)*radius,rect={x:x-w/2,y:y-h/2,w,h};
            if(rect.x<7||rect.x+w>width-7||rect.y<7||rect.y+h>height-7)continue;
            if(!occupied.some(other=>intersect(rect,other,4))){chosen={x,y,rect};break search;}
          }
        }
      }
    }
    if(!chosen){node.hidden=true;if(!moving())item.offset=null;continue;}
    item.offset={x:chosen.x-anchor.x,y:chosen.y-anchor.y};
    node.hidden=false;node.style.left=`${chosen.x}px`;node.style.top=`${chosen.y}px`;node.style.visibility='visible';occupied.push(chosen.rect);
    if(Math.hypot(chosen.x-anchor.x,chosen.y-anchor.y)>18){
      const endX=clamp(anchor.x,chosen.rect.x+3,chosen.rect.x+w-3),endY=clamp(anchor.y,chosen.rect.y+3,chosen.rect.y+h-3);
      leaders.append(svg('line',{x1:anchor.x,y1:anchor.y,x2:endX,y2:endY,class:data.planned?'planned-leader':''}));
    }
    if(type==='place')leaders.append(svg('circle',{cx:anchor.x,cy:anchor.y,r:data.planned?4:2.5,fill:data.planned?'#bf5733':'#fff5df',stroke:'#fff4d8','stroke-width':1.5}));
  }
}
function positionCard(){
  if(card.hidden||!selected)return;
  if(width<=700){card.style.left='12px';card.style.top='auto';return;}
  const anchor=screen(selected.data.x,selected.data.y),box=card.getBoundingClientRect();
  let x=anchor.x+25,y=anchor.y-20;
  if(x+box.width>width-14)x=anchor.x-box.width-25;
  card.style.left=`${clamp(x,12,width-box.width-12)}px`;card.style.top=`${clamp(y,12,height-box.height-12)}px`;
}
function render(){
  world.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;
  for(const path of routePaths){
    path.halo.setAttribute('stroke-width',String((path.train?6:8)/scale));
    path.line.setAttribute('stroke-width',String((path.train?3:4.5)/scale));
    path.hit.setAttribute('stroke-width',String(24/scale));
    if(path.train)path.line.setAttribute('stroke-dasharray',`${6/scale} ${4/scale}`);
    path.arrow.setAttribute('stroke-width','1.8');
    path.arrow.setAttribute('transform',`translate(${path.point.x} ${path.point.y}) rotate(${path.angle}) scale(${1/scale})`);
    path.group.classList.toggle('active',selected?.data.id===path.id);
  }
  for(const {place,node} of hotspots){
    const [x,y,w,h]=place.figure,anchor=screen(x,y),sw=Math.max(18,w*scale),sh=Math.max(18,h*scale);
    const show=allowed(place)&&anchor.x+sw>=0&&anchor.x<=width&&anchor.y+sh>=0&&anchor.y<=height;
    node.hidden=!show;node.disabled=!show;
    node.style.left=`${anchor.x}px`;node.style.top=`${anchor.y}px`;node.style.width=`${sw}px`;node.style.height=`${sh}px`;
    node.classList.toggle('selected',selected?.data.id===place.id);
  }
  positionCard();renderLabels();
}
function fitBounds(bounds){
  const area=mapViewport();scale=Math.min((area.w-20)/bounds.w,(area.h-32)/bounds.h);
  tx=area.x+area.w/2-(bounds.x+bounds.w/2)*scale;
  ty=area.y+area.h/2-(bounds.y+bounds.h/2)*scale;
  clampCamera();overview=true;requestLayout();
}
function fitMap(){closeCard();fitBounds({x:0,y:0,w:MAP.width,h:MAP.height});}
function fitRoute(){closeCard();fitBounds({x:375,y:228,w:870,h:630});}
function minScale(){const area=mapViewport();return Math.min(area.w/MAP.width,area.h/MAP.height)*.85;}
function zoom(factor,x=width/2,y=height/2){
  const next=clamp(scale*factor,minScale(),3.2),wx=(x-tx)/scale,wy=(y-ty)/scale;
  scale=next;tx=x-wx*scale;ty=y-wy*scale;overview=false;clampCamera();requestLayout();
}
function focusPlace(place,visit=null){
  overview=false;openCard('place',place,visit);
  const area=mapViewport();let bottom=area.y+area.h;
  if(width<=700)bottom=Math.min(bottom,card.getBoundingClientRect().top-18);
  scale=clamp(Math.max(scale,width<=700?.78:.9),minScale(),3.2);
  tx=width/2-place.x*scale;ty=area.y+Math.max(70,bottom-area.y)*.45-place.y*scale;
  clampCamera();requestLayout();
  const button=document.querySelector(`.journey-stop[data-visit="${currentVisit}"]`);
  if(button){
    const list=$('journey-stops'),itemBox=button.getBoundingClientRect(),listBox=list.getBoundingClientRect();
    list.scrollTo({left:list.scrollLeft+itemBox.left+itemBox.width/2-listBox.left-listBox.width/2,behavior:'instant'});
  }
}
$('zoom-in').addEventListener('click',()=>zoom(1.35));
$('zoom-out').addEventListener('click',()=>zoom(1/1.35));
$('fit-map').addEventListener('click',fitMap);$('fit-route').addEventListener('click',fitRoute);
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));
$('extra-category').addEventListener('change',event=>{category=event.target.value;closeCard();requestLayout();});

atlas.addEventListener('wheel',event=>{
  if(event.target.closest(UI))return;
  event.preventDefault();zoom(Math.exp(-clamp(event.deltaY,-120,120)*.0026),event.clientX,event.clientY);
},{passive:false});
// Cancel the browser's native scroll gesture only on the map, never on the
// horizontally scrollable journey or the information sheet.
atlas.addEventListener('touchmove',event=>{if(!event.target.closest(UI))event.preventDefault();},{passive:false});
atlas.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.target.closest(UI))return;
  suppressClickUntil=0;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===1)drag={id:event.pointerId,x:event.clientX,y:event.clientY,tx,ty,moved:false};
  if(pointers.size===2){
    const [a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
    pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale,wx:(cx-tx)/scale,wy:(cy-ty)/scale};
    if(drag)drag.moved=true;
    closeCard();overview=false;atlas.classList.add('dragging');suppressClickUntil=performance.now()+400;
    // Touch pointers already have implicit capture to their initial target.
    if(event.pointerType!=='touch')for(const id of pointers.keys())atlas.setPointerCapture(id);
  }
});
window.addEventListener('pointermove',event=>{
  if(!pointers.has(event.pointerId))return;
  pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pointers.size===2&&pinch){
    const [a,b]=[...pointers.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
    scale=clamp(pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/Math.max(1,pinch.distance),minScale(),3.2);
    tx=cx-pinch.wx*scale;ty=cy-pinch.wy*scale;clampCamera();
    requestLayout();suppressClickUntil=performance.now()+400;return;
  }
  if(!drag||drag.id!==event.pointerId)return;
  const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<7)return;
  if(!drag.moved){drag.moved=true;closeCard();overview=false;atlas.classList.add('dragging');if(event.pointerType!=='touch')atlas.setPointerCapture(event.pointerId);}
  tx=drag.tx+dx;ty=drag.ty+dy;clampCamera();requestLayout();suppressClickUntil=performance.now()+400;
});
function endPointer(event){
  if(!pointers.has(event.pointerId))return;
  if(moving())suppressClickUntil=performance.now()+400;
  pointers.delete(event.pointerId);
  if(atlas.hasPointerCapture(event.pointerId))atlas.releasePointerCapture(event.pointerId);
  if(pointers.size<2)pinch=null;
  if(!pointers.size){drag=null;atlas.classList.remove('dragging');requestLayout();}
  else{const [id,p]=[...pointers.entries()][0];drag={id,x:p.x,y:p.y,tx,ty,moved:true};}
}
window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
window.addEventListener('blur',()=>{pointers.clear();drag=null;pinch=null;atlas.classList.remove('dragging');requestLayout();});
atlas.addEventListener('click',event=>{
  if(performance.now()<suppressClickUntil&&!event.target.closest(UI)){event.preventDefault();event.stopImmediatePropagation();return;}
  if(!event.target.closest('button,select,.place-card,.route-hit,.journey-strip,.explore-controls'))closeCard();
},true);
document.addEventListener('keydown',event=>{
  if(event.target.closest('input,select,textarea'))return;
  if(event.key==='Escape')closeCard();
  else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.25);}
  else if(event.key==='-'){event.preventDefault();zoom(.8);}
  else if(event.key==='Home'){event.preventDefault();fitRoute();}
});
function resize(){
  const nextWidth=atlas.clientWidth,nextHeight=atlas.clientHeight;
  if(nextWidth===width&&nextHeight===height)return;
  const wx=(width/2-tx)/scale,wy=(height/2-ty)/scale;
  width=nextWidth;height=nextHeight;
  if(overview){if(view==='route')fitRoute();else fitMap();}
  else{tx=width/2-wx*scale;ty=height/2-wy*scale;clampCamera();requestLayout();}
}
new ResizeObserver(resize).observe(atlas);

const initialId=location.hash.slice(1);
buildJourney();buildRoutes();buildPlaces();updateView();fitRoute();
function openFromHash(id){
  const place=places.find(place=>place.id===id),road=roads.find(road=>road.id===id);
  if(place)focusPlace(place);
  else if(road)openCard('road',road);
  else if(id==='train')openCard('train',railway);
  else if(id==='about')openCard('about',{id:'about',x:160,y:800});
  else closeCard();
}
if(initialId)openFromHash(initialId);
window.addEventListener('hashchange',()=>openFromHash(location.hash.slice(1)));
$('artwork').addEventListener('load',requestLayout);
document.fonts.ready.then(()=>{for(const item of labelItems)item.sizeKey=null;requestLayout();});
