(() => {
  "use strict";
  const people = Array.isArray(window.FAMILY_DATA) ? window.FAMILY_DATA : [];
  const byId = new Map(people.map(p => [p.id, p]));
  const viewport = document.getElementById("treeViewport");
  const stage = document.getElementById("treeStage");
  const nodes = document.getElementById("treeNodes");
  const svg = document.getElementById("connections");
  const search = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const filter = document.getElementById("branchFilter");
  const empty = document.getElementById("emptyState");
  const panel = document.getElementById("profilePanel");
  const backdrop = document.getElementById("profileBackdrop");
  const profileContent = document.getElementById("profileContent");
  let scale = 0.85, tx = 35, ty = 35, drag = null, activeId = null, lastFocus = null, hasInitialCentered = false;
  const cardW = 156, cardH = 155, gapX = 32, gapY = 100, pad = 35;
  const positions = new Map();

  function safe(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function initials(name) { return String(name || "?").trim().split(/\s+/).slice(0,2).map(s => s[0] || "").join("").toUpperCase(); }
  function year(date) { return date ? String(date).slice(0,4) : ""; }
  function formatDate(date) {
    if (!date) return "";
    const d = new Date(date + "T00:00:00");
    return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined,{year:"numeric",month:"long",day:"numeric"});
  }
  function personAvatar(p, big=false) {
    const cls = big ? "avatar profile-avatar" : "avatar";
    return p.photo
      ? `<div class="${cls}"><img src="${safe(p.photo)}" alt="" onerror="this.parentElement.innerHTML='${safe(initials(p.fullName))}'"></div>`
      : `<div class="${cls}" aria-hidden="true">${safe(initials(p.fullName))}</div>`;
  }
  function spousePairs(list) {
    const ids = new Set(list.map(p=>p.id)), pairs=[];
    list.forEach(p => (p.spouseIds||[]).forEach(sid => {
      if (ids.has(sid) && p.id < sid && !pairs.some(q => (q.a===p.id&&q.b===sid)||(q.a===sid&&q.b===p.id))) pairs.push({a:p.id,b:sid});
    }));
    return pairs;
  }
  function ancestorIds(id) {
    const out=new Set(), stack=[id];
    while(stack.length){const cur=byId.get(stack.pop()); if(!cur)continue; (cur.parentIds||[]).forEach(pid=>{if(!out.has(pid)){out.add(pid);stack.push(pid);}});}
    return out;
  }
  function visiblePeople() {
    const mode=filter.value;
    if(mode==="all") return people.slice();
    const roots=people.filter(p=>p.branch===mode);
    const keep=new Set(roots.map(p=>p.id));
    // Include spouses and relatives connected through parent-child edges so a branch is not shown as isolated fragments.
    roots.forEach(p=>{(p.spouseIds||[]).forEach(id=>keep.add(id)); (p.parentIds||[]).forEach(id=>keep.add(id));});
    let changed=true;
    while(changed){changed=false; people.forEach(p=>{
      if(keep.has(p.id)) {
        (p.parentIds||[]).concat(p.spouseIds||[]).forEach(id=>{if(byId.has(id)&&!keep.has(id)){keep.add(id);changed=true;}});
        people.filter(c=>(c.parentIds||[]).includes(p.id)).forEach(c=>{if(!keep.has(c.id)){keep.add(c.id);changed=true;}});
      }
    });}
    return people.filter(p=>keep.has(p.id));
  }
  const idCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  function assignPositions(list) {
    positions.clear();
    const ids=new Set(list.map(p=>p.id)), depthMemo=new Map(), visiting=new Set();
    function depth(p) {
      if(depthMemo.has(p.id))return depthMemo.get(p.id);
      if(visiting.has(p.id))return 0;
      visiting.add(p.id);
      const parents=(p.parentIds||[]).filter(id=>ids.has(id)&&byId.has(id));
      const d=parents.length?1+Math.max(...parents.map(id=>depth(byId.get(id)))):0;
      visiting.delete(p.id); depthMemo.set(p.id,d); return d;
    }
    list.forEach(p=>depth(p));
    // Order within each generation follows parent positions when possible, while keeping sibling groups together.
    const generations=new Map();
    list.forEach(p=>{const d=depthMemo.get(p.id)||0;if(!generations.has(d))generations.set(d,[]);generations.get(d).push(p);});
    const placed=new Map();
    const orderedDepths=[...generations.keys()].sort((a,b)=>a-b);
    orderedDepths.forEach(d=>{
      let group=generations.get(d);
      if(d>0) group.sort((a,b)=>{
        const pa=(a.parentIds||[]).map(id=>placed.get(id)).filter(Boolean);
        const pb=(b.parentIds||[]).map(id=>placed.get(id)).filter(Boolean);
        const xa=pa.length?pa.reduce((s,v)=>s+v.x,0)/pa.length:Infinity;
        const xb=pb.length?pb.reduce((s,v)=>s+v.x,0)/pb.length:Infinity;
        // Keep sibling order stable by ID (p2, p3, ... p10), not alphabetically by name.
        return xa-xb || idCollator.compare(a.id, b.id);
      });
      // Keep partners next to each other if both are in the same generation.
      const groupIds=new Set(group.map(p=>p.id)), used=new Set(), arranged=[];
      group.forEach(p=>{if(used.has(p.id))return; arranged.push(p);used.add(p.id);
        const partner=(p.spouseIds||[]).map(id=>byId.get(id)).find(q=>q&&groupIds.has(q.id)&&!used.has(q.id));
        if(partner){arranged.push(partner);used.add(partner.id);}
      });
      arranged.forEach((p,i)=>{const x=pad+i*(cardW+gapX), y=pad+d*(cardH+gapY);positions.set(p.id,{x,y,depth:d});placed.set(p.id,{x:x+cardW/2,y:y+cardH/2});});
    });
    // Center every parent over the full span of its descendant leaves.
    // Using the full descendant span (rather than averaging only immediate
    // children) keeps the tree balanced as branches grow at different rates.
    const childrenByParent = new Map();
    list.forEach(child => (child.parentIds || []).forEach(pid => {
      if (!ids.has(pid)) return;
      if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
      childrenByParent.get(pid).push(child);
    }));
    const leafSpanMemo = new Map();
    function leafSpan(personId, path = new Set()) {
      if (leafSpanMemo.has(personId)) return leafSpanMemo.get(personId);
      if (path.has(personId)) {
        const pos = positions.get(personId);
        return pos ? [pos.x + cardW / 2, pos.x + cardW / 2] : [0, 0];
      }
      const pos = positions.get(personId);
      if (!pos) return [0, 0];
      const nextPath = new Set(path);
      nextPath.add(personId);
      const children = childrenByParent.get(personId) || [];
      const spans = children.map(child => leafSpan(child.id, nextPath));
      const span = spans.length
        ? [Math.min(...spans.map(s => s[0])), Math.max(...spans.map(s => s[1]))]
        : [pos.x + cardW / 2, pos.x + cardW / 2];
      leafSpanMemo.set(personId, span);
      return span;
    }
    // Position parents after measuring descendant spans, from deepest to root.
    [...list].sort((a, b) => (depthMemo.get(b.id) || 0) - (depthMemo.get(a.id) || 0))
      .forEach(person => {
        const childIds = (childrenByParent.get(person.id) || []).map(child => child.id);
        if (!childIds.length) return;
        const spans = childIds.map(id => leafSpan(id));
        const left = Math.min(...spans.map(s => s[0]));
        const right = Math.max(...spans.map(s => s[1]));
        const pos = positions.get(person.id);
        if (pos) pos.x = (left + right) / 2 - cardW / 2;
        leafSpanMemo.clear();
      });

    // Shift the entire tree together if any centered ancestor extends left
    // of the canvas origin. This preserves all parent/child alignments.
    const minX = Math.min(0, ...[...positions.values()].map(p => p.x - pad));
    if (minX < 0) positions.forEach(p => { p.x -= minX; });

    const maxX=Math.max(1000,...[...positions.values()].map(p=>p.x+cardW+pad));
    const maxY=Math.max(700,...[...positions.values()].map(p=>p.y+cardH+pad));
    stage.style.width=maxX+"px";stage.style.height=maxY+"px";svg.setAttribute("viewBox",`0 0 ${maxX} ${maxY}`);
  }
  function edgePath(a,b,spouse=false) {
    const x1=a.x+cardW/2, y1=a.y+cardH, x2=b.x+cardW/2, y2=b.y;
    if(spouse) return `<path class="edge spouse" d="M ${a.x+cardW} ${a.y+cardH/2} C ${a.x+cardW+18} ${a.y+cardH/2}, ${b.x-18} ${b.y+cardH/2}, ${b.x} ${b.y+cardH/2}"/>`;
    const mid=y1+(y2-y1)/2;
    return `<path class="edge" d="M ${x1} ${y1} V ${mid} H ${x2} V ${y2}"/>`;
  }
  function render() {
    const list=visiblePeople(); assignPositions(list); nodes.innerHTML=""; svg.innerHTML="";
    const listIds=new Set(list.map(p=>p.id));
    list.forEach(p=>{
      const pos=positions.get(p.id), card=document.createElement("button");
      card.type="button";card.className="person-card";card.dataset.id=p.id;card.setAttribute("aria-label",`Open profile for ${p.fullName}`);
      card.style.left=pos.x+"px";card.style.top=pos.y+"px";
      card.innerHTML=`${personAvatar(p)}<div class="name">${safe(p.fullName)}</div><div class="role">${safe(p.role||"Family member")}</div><div class="years">${safe(year(p.birthDate))}${p.deathDate?" – "+safe(year(p.deathDate)):""}</div>`;
      card.addEventListener("click",()=>openProfile(p.id));nodes.appendChild(card);
    });
    // Parent-child connections; shared children connect to a midpoint between known parents.
    list.forEach(child=>{
      const childPos=positions.get(child.id); if(!childPos)return;
      const parents=(child.parentIds||[]).filter(id=>listIds.has(id)&&positions.has(id));
      if(!parents.length)return;
      const parentPos=parents.map(id=>({id,...positions.get(id)}));
      if(parentPos.length===1) svg.insertAdjacentHTML("beforeend",edgePath(parentPos[0],childPos));
      else {
        const centers=parentPos.map(p=>p.x+cardW/2), y=parentPos[0].y+cardH/2;
        const top=parentPos[0].y+cardH, childX=childPos.x+cardW/2, junctionY=top+gapY/2;
        // Connect each parent card to a shared junction and down to the child.
        parentPos.forEach(p=>svg.insertAdjacentHTML("beforeend",`<path class="edge" d="M ${p.x+cardW/2} ${p.y+cardH} V ${junctionY}"/>`));
        const min=Math.min(...centers),max=Math.max(...centers);
        svg.insertAdjacentHTML("beforeend",`<path class="edge" d="M ${min} ${junctionY} H ${max} M ${(min+max)/2} ${junctionY} V ${childPos.y} H ${childX} V ${childPos.y}"/>`);
      }
    });
    spousePairs(list).forEach(pair=>{
      const a=positions.get(pair.a),b=positions.get(pair.b); if(a&&b&&a.depth===b.depth) svg.insertAdjacentHTML("beforeend",edgePath(a,b,true));
    });
    empty.hidden=list.length>0;
    applyTransform();
    if (!hasInitialCentered && list.length) {
      const roots = list.filter(p => !(p.parentIds || []).some(id => listIds.has(id)));
      if (roots.length) {
        centerOn(roots[0].id);
        hasInitialCentered = true;
      }
    }
    if(activeId&&positions.has(activeId)) highlight(activeId,false);
  }
  function applyTransform(){stage.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;}
  function centerOn(id) {
    const p=positions.get(id);if(!p)return;
    scale=Math.min(1.1,Math.max(.55,scale));tx=viewport.clientWidth/2-(p.x+cardW/2)*scale;ty=viewport.clientHeight/2-(p.y+cardH/2)*scale;applyTransform();highlight(id,true);
  }
  function highlight(id,scroll=true) {
    activeId=id;document.querySelectorAll(".person-card").forEach(el=>el.classList.toggle("highlight",el.dataset.id===id));
    if(scroll)centerOn(id);
  }
  function openProfile(id) {
    const p=byId.get(id);if(!p)return;lastFocus=document.activeElement;activeId=id;
    const relatives=(ids,label)=>ids.filter(rid=>byId.has(rid)).map(rid=>`<button class="relative-link" data-relative="${safe(rid)}">${safe(byId.get(rid).fullName)}<small>${safe(label)}</small></button>`).join("");
    const parents=relatives(p.parentIds||[],"Parent");
    const spouses=relatives(p.spouseIds||[],"Spouse / partner");
    const children=relatives(people.filter(c=>(c.parentIds||[]).includes(id)).map(c=>c.id),"Child");
    const siblings=relatives(people.filter(s=>s.id!==id&&(s.parentIds||[]).some(pid=>(p.parentIds||[]).includes(pid))&&(p.parentIds||[]).length).map(s=>s.id),"Sibling");
    profileContent.innerHTML=`<div class="profile-hero">${personAvatar(p,true)}<h2 id="profileName">${safe(p.fullName)}</h2><p>${safe(p.role||"Family member")}</p></div>
      <div class="profile-section"><h3>Personal details</h3><div class="detail-grid">
      <div><span class="detail-label">Date of birth</span><span class="detail-value">${safe(formatDate(p.birthDate)||"Not provided")}</span></div>
      <div><span class="detail-label">Date of death</span><span class="detail-value">${safe(formatDate(p.deathDate)||"—")}</span></div>
      <div><span class="detail-label">Occupation</span><span class="detail-value">${safe(p.occupation||"Not provided")}</span></div>
      <div><span class="detail-label">Hometown</span><span class="detail-value">${safe(p.hometown||"Not provided")}</span></div></div></div>
      ${p.biography?`<div class="profile-section"><h3>Story</h3><p>${safe(p.biography)}</p></div>`:""}
      ${parents?`<div class="profile-section"><h3>Parents</h3>${parents}</div>`:""}
      ${spouses?`<div class="profile-section"><h3>Spouse / partner</h3>${spouses}</div>`:""}
      ${children?`<div class="profile-section"><h3>Children</h3>${children}</div>`:""}
      ${siblings?`<div class="profile-section"><h3>Siblings</h3>${siblings}</div>`:""}
      ${p.notes?`<div class="profile-section"><h3>Notes</h3><p>${safe(p.notes)}</p></div>`:""}`;
    panel.hidden=false;backdrop.hidden=false;document.body.style.overflow="hidden";document.getElementById("closeProfile").focus();
    profileContent.querySelectorAll("[data-relative]").forEach(btn=>btn.addEventListener("click",()=>openProfile(btn.dataset.relative)));
  }
  function closeProfile(){panel.hidden=true;backdrop.hidden=true;document.body.style.overflow="";if(lastFocus&&lastFocus.focus)lastFocus.focus();}
  document.getElementById("closeProfile").addEventListener("click",closeProfile);backdrop.addEventListener("click",closeProfile);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden)closeProfile();if(e.key==="Escape"&&!searchResults.hidden){searchResults.hidden=true;search.blur();}});
  search.addEventListener("input",()=>{
    const q=search.value.trim().toLocaleLowerCase();searchResults.innerHTML="";
    if(!q){searchResults.hidden=true;return;}
    const matches=people.filter(p=>p.fullName.toLocaleLowerCase().includes(q)).slice(0,12);
    matches.forEach(p=>{const b=document.createElement("button");b.className="search-result";b.type="button";b.setAttribute("role","option");b.innerHTML=`${safe(p.fullName)}<small>${safe(p.role||"Family member")}</small>`;b.addEventListener("click",()=>{filter.value="all";render();search.value=p.fullName;searchResults.hidden=true;centerOn(p.id);});searchResults.appendChild(b);});
    if(!matches.length)searchResults.innerHTML='<div class="search-result">No matching family members</div>';
    searchResults.hidden=false;
  });
  document.addEventListener("click",e=>{if(!e.target.closest(".search-wrap"))searchResults.hidden=true;});
  filter.addEventListener("change",render);
  document.getElementById("zoomIn").addEventListener("click",()=>{scale=Math.min(1.7,scale+.12);applyTransform();});
  document.getElementById("zoomOut").addEventListener("click",()=>{scale=Math.max(.35,scale-.12);applyTransform();});
  function reset(){scale=.85;tx=35;ty=35;applyTransform();}
  document.getElementById("resetView").addEventListener("click",reset);
  document.getElementById("homeView").addEventListener("click",()=>{filter.value="all";search.value="";searchResults.hidden=true;render();reset();});
  document.getElementById("exploreBtn").addEventListener("click",()=>document.getElementById("family").scrollIntoView({behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"}));
  viewport.addEventListener("pointerdown",e=>{if(e.target.closest(".person-card"))return;drag={x:e.clientX,y:e.clientY,tx,ty};viewport.classList.add("dragging");viewport.setPointerCapture(e.pointerId);});
  viewport.addEventListener("pointermove",e=>{if(!drag)return;tx=drag.tx+e.clientX-drag.x;ty=drag.ty+e.clientY-drag.y;applyTransform();});
  function endDrag(){drag=null;viewport.classList.remove("dragging");}
  viewport.addEventListener("pointerup",endDrag);viewport.addEventListener("pointercancel",endDrag);
  viewport.addEventListener("wheel",e=>{if(!e.ctrlKey)return;e.preventDefault();scale=Math.max(.35,Math.min(1.7,scale+(e.deltaY<0?.06:-.06)));applyTransform();},{passive:false});
  window.addEventListener("resize",()=>{if(activeId&&positions.has(activeId))centerOn(activeId);});
  render();
})();
