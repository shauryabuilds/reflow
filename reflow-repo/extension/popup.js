let tabId=null,cfg=null,selected=null,tickTimer=null;
const opts={hardRefresh:true,preserveScroll:true,randomize:false,notify:false};
const $=s=>document.querySelector(s);
const dot=$("#dot"),urlText=$("#urlText"),badge=$("#badge"),livePanel=$("#livePanel"),liveTime=$("#liveTime"),liveEvery=$("#liveEvery"),liveCount=$("#liveCount"),trackFill=$("#trackFill"),setupPanel=$("#setupPanel"),actionBtn=$("#actionBtn"),presets=$("#presets"),cVal=$("#cVal"),cUnit=$("#cUnit"),ftrText=$("#ftrText");

async function init(){
  const[tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab)return; tabId=tab.id;
  try{const u=new URL(tab.url);urlText.textContent=u.hostname+(u.pathname!=="/"?u.pathname:"");}catch(e){urlText.textContent=tab.title||"—";}
  chrome.runtime.sendMessage({type:"GET_TAB",tabId},r=>{if(r?.config?.active){cfg=r.config;showLive();}else{showSetup();loadDomainPref(tab.url);}});
  chrome.runtime.sendMessage({type:"GET_ALL"},r=>{if(!r?.state)return;const n=Object.values(r.state).filter(s=>s.active).length;if(n>0){badge.textContent=n+" active";badge.classList.add("vis");}});
}

async function loadDomainPref(url){try{const domain=new URL(url).hostname;chrome.runtime.sendMessage({type:"GET_DOMAIN_PREF",domain},r=>{if(r?.pref){const sec=r.pref.interval;const match=presets.querySelector(`[data-s="${sec}"]`);if(match){match.classList.add("sel");selected=sec;}else{if(sec>=3600){cVal.value=sec/3600;cUnit.value="3600";}else if(sec>=60){cVal.value=sec/60;cUnit.value="60";}else{cVal.value=sec;cUnit.value="1";}selected=sec;}if(r.pref.hardRefresh!==undefined)opts.hardRefresh=r.pref.hardRefresh;if(r.pref.preserveScroll!==undefined)opts.preserveScroll=r.pref.preserveScroll;if(r.pref.randomize!==undefined)opts.randomize=r.pref.randomize;if(r.pref.notify!==undefined)opts.notify=r.pref.notify;syncOptUI();ftrText.textContent="Remembered for "+domain;}});}catch(e){}}
function syncOptUI(){document.querySelectorAll(".opt").forEach(el=>{el.classList.toggle("on",!!opts[el.dataset.k]);});}

function showSetup(){livePanel.classList.remove("vis");setupPanel.style.display="";actionBtn.textContent="Start";actionBtn.classList.remove("stop");dot.classList.remove("on");if(tickTimer)clearInterval(tickTimer);}
function showLive(){if(!cfg)return;dot.classList.add("on");livePanel.classList.add("vis");setupPanel.style.display="none";actionBtn.textContent="Stop";actionBtn.classList.add("stop");liveEvery.textContent=fmtInterval(cfg.interval);ftrText.textContent="Since "+new Date(cfg.startedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});if(tickTimer)clearInterval(tickTimer);doTick();tickTimer=setInterval(doTick,200);}
function doTick(){if(!cfg)return;const left=Math.max(0,Math.round((cfg.nextAt-Date.now())/1000));liveTime.textContent=fmtTime(left);liveCount.textContent=cfg.count||0;trackFill.style.width=(Math.min(1,1-left/cfg.interval)*100)+"%";if(left<=0){cfg.nextAt=Date.now()+cfg.interval*1000;cfg.count=(cfg.count||0)+1;}}
function fmtTime(s){if(s>=3600){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h+":"+pad(m)+":"+pad(s%60);}if(s>=60)return Math.floor(s/60)+":"+pad(s%60);return String(s);}
function fmtInterval(s){if(s>=3600){const h=s/3600;return(h%1?h.toFixed(1):h)+"h";}if(s>=60){const m=s/60;return(m%1?m.toFixed(1):m)+"m";}return s+"s";}
function pad(n){return String(n).padStart(2,"0");}

presets.addEventListener("click",e=>{const btn=e.target.closest(".p-btn");if(!btn)return;presets.querySelectorAll(".p-btn").forEach(b=>b.classList.remove("sel"));btn.classList.add("sel");selected=parseInt(btn.dataset.s);cVal.value="";doStart(selected);});
function getCustom(){const v=parseFloat(cVal.value);if(!v||v<=0)return null;return Math.round(v*parseInt(cUnit.value));}
cVal.addEventListener("input",()=>{presets.querySelectorAll(".p-btn").forEach(b=>b.classList.remove("sel"));const s=getCustom();if(s)selected=s;});
cVal.addEventListener("keydown",e=>{if(e.key==="Enter"){const s=getCustom();if(s)doStart(s);}});
cUnit.addEventListener("change",()=>{const s=getCustom();if(s)selected=s;});
document.querySelectorAll(".opt").forEach(el=>{el.addEventListener("click",()=>{const k=el.dataset.k;opts[k]=!opts[k];el.classList.toggle("on",opts[k]);});});
actionBtn.addEventListener("click",()=>{if(cfg?.active){chrome.runtime.sendMessage({type:"STOP",tabId},()=>{cfg=null;showSetup();updateBadge();});}else{const s=selected||getCustom();if(s&&s>0)doStart(s);}});

function doStart(seconds){
  const o={hardRefresh:opts.hardRefresh,preserveScroll:opts.preserveScroll,randomize:opts.randomize,randomRange:opts.randomize?Math.max(1,Math.round(seconds*.3)):0,notify:opts.notify};
  chrome.runtime.sendMessage({type:"START",tabId,interval:seconds,opts:o},()=>{cfg={interval:seconds,active:true,startedAt:Date.now(),nextAt:Date.now()+seconds*1000,count:0,...o};showLive();updateBadge();});
}
function updateBadge(){chrome.runtime.sendMessage({type:"GET_ALL"},r=>{if(!r?.state)return;const n=Object.values(r.state).filter(s=>s.active).length;if(n>0){badge.textContent=n+" active";badge.classList.add("vis");}else badge.classList.remove("vis");});}
init();
