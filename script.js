(() => {
  "use strict";
  const people = Array.isArray(window.FAMILY_DATA) ? window.FAMILY_DATA : [];
  const byId = new Map(people.map(p => [p.id, p]));
  const viewport = document.getElementById("treeViewport");
  const stage = document.getElementById("treeStage");
  const nodes = document.getElementById("treeNodes");
  const generationBands = document.getElementById("generationBands");
  const svg = document.getElementById("connections");
  const search = document.getElementById("searchInput");
  const searchResults = document.getElementById("searchResults");
  const filter = document.getElementById("branchFilter");
  const empty = document.getElementById("emptyState");
  const panel = document.getElementById("profilePanel");
  const backdrop = document.getElementById("profileBackdrop");
  const profileContent = document.getElementById("profileContent");
  let scale = 0.85, tx = 35, ty = 35, drag = null, activeId = null, lastFocus = null, hasInitialCentered = false;
  const cardW = 156, cardH = 176, gapX = 32, gapY = 100, pad = 35;
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
  function childrenCounts(person, list) {
    // Count children linked to this person OR their spouse. Some records list
    // only one parent ID for a child, so both spouses use the combined parent IDs.
    const partnerIds = new Set([
      ...(person.spouseIds || []).filter(Boolean),
      ...people
        .filter(other => (other.spouseIds || []).filter(Boolean).includes(person.id))
        .map(other => other.id)
    ]);
    const familyParentIds = new Set([person.id, ...partnerIds]);
    const children = people.filter(child =>
      (child.parentIds || []).some(parentId => familyParentIds.has(parentId))
    );
    const uniqueChildren = [...new Map(children.map(child => [child.id, child])).values()];
    let sons = 0, daughters = 0;
    uniqueChildren.forEach(child => {
      const gender = String(child.gender || "").trim().toLowerCase();
      if (["male", "m", "man", "boy"].includes(gender)) sons++;
      else if (["female", "f", "woman", "girl"].includes(gender)) daughters++;
    });
    return `${sons} ${sons === 1 ? "son" : "sons"} · ${daughters} ${daughters === 1 ? "daughter" : "daughters"}`;
  }

  function spousePairs(list) {
    const ids = new Set(list.map(p => p.id)), seen = new Set(), pairs = [];
    list.forEach(p => (p.spouseIds || []).filter(Boolean).forEach(sid => {
      if (!ids.has(sid) || sid === p.id) return;
      const a = p.id < sid ? p.id : sid;
      const b = p.id < sid ? sid : p.id;
      const key = `${a}::${b}`;
      if (!seen.has(key)) {
        seen.add(key);
        pairs.push({ a, b });
      }
    }));
    // A relationship may be recorded on only one partner's record.
    list.forEach(p => list.forEach(other => {
      if (p.id === other.id) return;
      const linked = (p.spouseIds || []).includes(other.id) || (other.spouseIds || []).includes(p.id);
      if (!linked) return;
      const a = p.id < other.id ? p.id : other.id;
      const b = p.id < other.id ? other.id : p.id;
      const key = `${a}::${b}`;
      if (!seen.has(key)) { seen.add(key); pairs.push({ a, b }); }
    }));
    return pairs;
  }
  // Classify cards for visual differentiation. A spouse-only card is a person
  // connected through spouseIds who is not already represented as a child or parent
  // in the displayed family branch. Direct descendants retain their gender color.
  function cardType(person, list) {
    const listIds = new Set(list.map(p => p.id));
    const validParents = (person.parentIds || []).some(id => listIds.has(id));
    const hasChildren = list.some(child => (child.parentIds || []).includes(person.id));
    const spouseLinked = (person.spouseIds || []).some(id => listIds.has(id)) ||
      list.some(other => (other.spouseIds || []).includes(person.id));
    if (spouseLinked && !validParents && !hasChildren) return "spouse";
    const gender = String(person.gender || "").trim().toLowerCase();
    if (gender === "female" || gender === "f" || gender === "woman") return "female";
    if (gender === "male" || gender === "m" || gender === "man") return "male";
    return "unknown";
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
    const ids = new Set(list.map(p => p.id));
    const depthMemo = new Map();
    const depthVisiting = new Set();
    const childrenByParent = new Map();
    const parentForLayout = new Map();
    const spouseOnlyPartner = new Map();
    const spouseOnlyByPartner = new Map();

    // A spouse with no recorded parents or children is placed beside their partner
    // as part of the same layout unit, instead of being treated as a separate root.
    list.forEach(person => {
      const hasParent = (person.parentIds || []).some(pid => ids.has(pid));
      const hasChildren = list.some(child => (child.parentIds || []).includes(person.id));
      if (hasParent || hasChildren) return;
      const linkedSpouseIds = new Set([
        ...(person.spouseIds || []).filter(Boolean),
        ...list.filter(other => (other.spouseIds || []).includes(person.id)).map(other => other.id)
      ]);
      const partner = [...linkedSpouseIds]
        .map(id => byId.get(id))
        .find(candidate => candidate && ids.has(candidate.id) && candidate.id !== person.id &&
          (((candidate.parentIds || []).some(pid => ids.has(pid))) ||
           list.some(child => (child.parentIds || []).includes(candidate.id))));
      if (partner && !spouseOnlyByPartner.has(partner.id)) {
        spouseOnlyPartner.set(person.id, partner.id);
        spouseOnlyByPartner.set(partner.id, person.id);
      }
    });

    // Preserve ID order and give each child one primary layout parent.
    // If a person has multiple parents, all relationships are still drawn below;
    // the first valid parent in parentIds controls the branch placement.
    list.forEach(child => {
      const validParents = (child.parentIds || []).filter(pid => ids.has(pid) && byId.has(pid));
      if (validParents.length) parentForLayout.set(child.id, validParents[0]);
      validParents.forEach(pid => {
        if (!childrenByParent.has(pid)) childrenByParent.set(pid, []);
        childrenByParent.get(pid).push(child.id);
      });
    });
    childrenByParent.forEach(childIds => {
      childIds.sort((a, b) => idCollator.compare(a, b));
    });

    function depth(personId) {
      if (depthMemo.has(personId)) return depthMemo.get(personId);
      if (depthVisiting.has(personId)) return 0;
      depthVisiting.add(personId);
      const partnerId = spouseOnlyPartner.get(personId);
      const parentId = parentForLayout.get(personId);
      const d = partnerId ? depth(partnerId) : (parentId ? depth(parentId) + 1 : 0);
      depthVisiting.delete(personId);
      depthMemo.set(personId, d);
      return d;
    }
    list.forEach(p => depth(p.id));

    // Compute the horizontal width required by every complete descendant branch.
    // This bottom-up measurement prevents branches from overlapping as they grow.
    const widthMemo = new Map();
    const widthVisiting = new Set();
    function subtreeWidth(personId) {
      if (widthMemo.has(personId)) return widthMemo.get(personId);
      if (widthVisiting.has(personId)) return cardW;
      widthVisiting.add(personId);
      const childIds = (childrenByParent.get(personId) || [])
        .filter(cid => parentForLayout.get(cid) === personId);
      const coupleWidth = spouseOnlyByPartner.has(personId) ? cardW * 2 + gapX : cardW;
      let width = coupleWidth;
      if (childIds.length) {
        const childrenWidth = childIds.reduce((sum, cid) => sum + subtreeWidth(cid), 0)
          + gapX * (childIds.length - 1);
        width = Math.max(coupleWidth, childrenWidth);
      }
      widthVisiting.delete(personId);
      widthMemo.set(personId, width);
      return width;
    }
    list.forEach(p => subtreeWidth(p.id));

    // Root branches are laid out left-to-right by ID. Each node is centered over
    // the full horizontal span reserved for its descendants.
    const roots = list
      .filter(p => !parentForLayout.has(p.id) && !spouseOnlyPartner.has(p.id))
      .sort((a, b) => idCollator.compare(a.id, b.id));
    let rootLeft = pad;
    const placed = new Set();

    function placeSubtree(personId, left, d, path = new Set()) {
      if (placed.has(personId) || path.has(personId)) return;
      const person = byId.get(personId);
      if (!person || !ids.has(personId)) return;
      const nextPath = new Set(path);
      nextPath.add(personId);
      const width = subtreeWidth(personId);
      const childIds = (childrenByParent.get(personId) || [])
        .filter(cid => parentForLayout.get(cid) === personId);
      const y = pad + d * (cardH + gapY);
      let x;

      if (!childIds.length) {
        const coupleWidth = spouseOnlyByPartner.has(personId) ? cardW * 2 + gapX : cardW;
        x = left + (width - coupleWidth) / 2;
      } else {
        const childTotal = childIds.reduce((sum, cid) => sum + subtreeWidth(cid), 0)
          + gapX * (childIds.length - 1);
        let childLeft = left + (width - childTotal) / 2;
        childIds.forEach(cid => {
          placeSubtree(cid, childLeft, d + 1, nextPath);
          childLeft += subtreeWidth(cid) + gapX;
        });
        const childPositions = childIds.map(cid => positions.get(cid)).filter(Boolean);
        if (childPositions.length) {
          const leftCenter = Math.min(...childPositions.map(pos => pos.x + cardW / 2));
          const rightCenter = Math.max(...childPositions.map(pos => pos.x + cardW / 2));
          x = (leftCenter + rightCenter) / 2 - cardW / 2;
        } else {
          x = left + (width - cardW) / 2;
        }
      }

      // Center the primary person within the couple's reserved width and place
      // the spouse immediately beside them at the same generation.
      if (spouseOnlyByPartner.has(personId)) {
        const spouseId = spouseOnlyByPartner.get(personId);
        const coupleWidth = cardW * 2 + gapX;
        // Leaf placement already computes the left edge of the couple's reserved
        // slot. For parents with descendants, x is the primary card's centered
        // position, so center the couple around that position instead.
        const coupleLeft = childIds.length
          ? x + cardW / 2 - coupleWidth / 2
          : x;
        positions.set(personId, { x: coupleLeft, y, depth: d });
        positions.set(spouseId, { x: coupleLeft + cardW + gapX, y, depth: d });
        placed.add(personId);
        placed.add(spouseId);
      } else {
        positions.set(personId, { x, y, depth: d });
        placed.add(personId);
      }
    }

    roots.forEach(root => {
      const width = subtreeWidth(root.id);
      placeSubtree(root.id, rootLeft, 0);
      rootLeft += width + gapX * 2;
    });

    // Defensive fallback for malformed/cyclic/disconnected records so no card disappears.
    list.filter(p => !placed.has(p.id))
      .sort((a, b) => idCollator.compare(a.id, b.id))
      .forEach(p => {
        const d = depthMemo.get(p.id) || 0;
        const x = rootLeft;
        positions.set(p.id, { x, y: pad + d * (cardH + gapY), depth: d });
        rootLeft += cardW + gapX;
      });

    // Normalize the tree to leave padding at the left edge.
    const minX = Math.min(0, ...[...positions.values()].map(pos => pos.x - pad));
    if (minX < 0) positions.forEach(pos => { pos.x -= minX; });

    const maxX = Math.max(1000, ...[...positions.values()].map(pos => pos.x + cardW + pad));
    const maxY = Math.max(700, ...[...positions.values()].map(pos => pos.y + cardH + pad));
    stage.style.width = maxX + "px";
    stage.style.height = maxY + "px";
    svg.setAttribute("viewBox", `0 0 ${maxX} ${maxY}`);
  }

  function edgePath(a,b,spouse=false) {
    const x1=a.x+cardW/2, y1=a.y+cardH, x2=b.x+cardW/2, y2=b.y;
    if(spouse) return `<path class="edge spouse" d="M ${a.x+cardW} ${a.y+cardH/2} C ${a.x+cardW+18} ${a.y+cardH/2}, ${b.x-18} ${b.y+cardH/2}, ${b.x} ${b.y+cardH/2}"/>`;
    const mid=y1+(y2-y1)/2;
    return `<path class="edge" d="M ${x1} ${y1} V ${mid} H ${x2} V ${y2}"/>`;
  }
  function renderGenerationBands(list) {
    if (!generationBands) return;
    generationBands.innerHTML = "";
    if (!positions.size) return;
    const maxDepth = Math.max(0, ...[...positions.values()].map(pos => pos.depth || 0));
    const width = parseFloat(stage.style.width) || 1000;
    const palette = [
      { bg: "#f1f5eb", border: "#e0e8d8", label: "#607557" },
      { bg: "#edf3f8", border: "#dce7f0", label: "#56718a" },
      { bg: "#f8f0e5", border: "#eee1ca", label: "#8a7045" },
      { bg: "#f6edf3", border: "#eadbe6", label: "#8a637d" },
      { bg: "#edf4f2", border: "#d8e8e2", label: "#547b70" },
      { bg: "#f4f0fa", border: "#e3daf1", label: "#75648d" }
    ];
    for (let depth = 0; depth <= maxDepth; depth++) {
      const rowY = pad + depth * (cardH + gapY);
      const color = palette[depth % palette.length];
      const band = document.createElement("div");
      band.className = "generation-band";
      band.style.left = "0px";
      band.style.top = (rowY - 16) + "px";
      band.style.width = width + "px";
      band.style.height = (cardH + 32) + "px";
      band.style.background = color.bg;
      band.style.borderColor = color.border;
      band.style.setProperty("--generation-label-color", color.label);
      band.innerHTML = `<span class="generation-band-label">GENERATION ${depth + 1}</span>`;
      generationBands.appendChild(band);
    }
  }

  function render() {
    const list=visiblePeople(); assignPositions(list); nodes.innerHTML=""; svg.innerHTML="";
    renderGenerationBands(list);
    const listIds=new Set(list.map(p=>p.id));
    list.forEach(p=>{
      const pos=positions.get(p.id), card=document.createElement("button");
      card.type="button";card.className="person-card person-card--"+cardType(p,list);card.dataset.id=p.id;card.setAttribute("aria-label",`Open profile for ${p.fullName}`);
      card.style.left=pos.x+"px";card.style.top=pos.y+"px";
      card.innerHTML=`${personAvatar(p)}<div class="name">${safe(p.fullName)}</div><div class="children-count">${safe(childrenCounts(p,list))}</div><div class="role">${safe(p.role||"Family member")}</div><div class="years">${safe(year(p.birthDate))}${p.deathDate?" – "+safe(year(p.deathDate)):""}</div>`;
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
  // Panning should behave like a canvas: empty space drags, cards remain clickable.
  // Disable native text selection during a pan so labels never get highlighted.
  viewport.style.userSelect = "none";
  viewport.style.webkitUserSelect = "none";
  stage.style.userSelect = "none";
  stage.style.webkitUserSelect = "none";
  viewport.style.cursor = "grab";
  viewport.addEventListener("pointerdown",e=>{
    if(e.target.closest(".person-card")) return;
    e.preventDefault();
    drag={x:e.clientX,y:e.clientY,tx,ty};
    viewport.classList.add("dragging");
    viewport.style.cursor="grabbing";
    viewport.setPointerCapture(e.pointerId);
  });
  viewport.addEventListener("pointermove",e=>{if(!drag)return;tx=drag.tx+e.clientX-drag.x;ty=drag.ty+e.clientY-drag.y;applyTransform();});
  function endDrag(){drag=null;viewport.classList.remove("dragging");viewport.style.cursor="grab";}
  viewport.addEventListener("pointerup",endDrag);viewport.addEventListener("pointercancel",endDrag);
  viewport.addEventListener("wheel",e=>{if(!e.ctrlKey)return;e.preventDefault();scale=Math.max(.35,Math.min(1.7,scale+(e.deltaY<0?.06:-.06)));applyTransform();},{passive:false});
  window.addEventListener("resize",()=>{if(activeId&&positions.has(activeId))centerOn(activeId);});

  // Print the complete tree canvas. The browser's Print dialog can save it as PDF.
  // The full canvas is scaled to fit one A4 landscape page, regardless of tree size.
  const printButton = document.getElementById("printTree");
  let printSnapshot = null;
  function prepareTreePrint() {
    const width = Math.max(stage.scrollWidth, parseFloat(stage.style.width) || 0, 1);
    const height = Math.max(stage.scrollHeight, parseFloat(stage.style.height) || 0, 1);
    // Approximate printable A4 landscape content area at 96 CSS px/in, with 5 mm margins.
    const targetWidth = 1040;
    const targetHeight = 700;
    const printScale = Math.min(targetWidth / width, targetHeight / height, 1);
    printSnapshot = {
      stageTransform: stage.style.transform,
      stageTransformOrigin: stage.style.transformOrigin,
      viewportWidth: viewport.style.width,
      viewportHeight: viewport.style.height,
      viewportOverflow: viewport.style.overflow,
      viewportPosition: viewport.style.position,
      viewportBorder: viewport.style.border,
      viewportBackground: viewport.style.background,
      viewportClass: viewport.classList.contains("print-mode")
    };
    document.body.classList.add("print-family-tree");
    viewport.classList.add("print-mode");
    viewport.style.setProperty("--print-width", (width * printScale) + "px");
    viewport.style.setProperty("--print-height", (height * printScale) + "px");
    viewport.style.width = (width * printScale) + "px";
    viewport.style.height = (height * printScale) + "px";
    viewport.style.overflow = "visible";
    viewport.style.position = "relative";
    viewport.style.border = "0";
    viewport.style.background = "#fff";
    stage.style.transformOrigin = "top left";
    stage.style.transform = `scale(${printScale})`;
  }
  function restoreTreeAfterPrint() {
    document.body.classList.remove("print-family-tree");
    if (!printSnapshot) return;
    stage.style.transform = printSnapshot.stageTransform;
    stage.style.transformOrigin = printSnapshot.stageTransformOrigin;
    viewport.style.width = printSnapshot.viewportWidth;
    viewport.style.height = printSnapshot.viewportHeight;
    viewport.style.overflow = printSnapshot.viewportOverflow;
    viewport.style.position = printSnapshot.viewportPosition;
    viewport.style.border = printSnapshot.viewportBorder;
    viewport.style.background = printSnapshot.viewportBackground;
    viewport.style.removeProperty("--print-width");
    viewport.style.removeProperty("--print-height");
    viewport.classList.toggle("print-mode", printSnapshot.viewportClass);
    printSnapshot = null;
  }
  if (printButton) printButton.addEventListener("click", () => {
    prepareTreePrint();
    // Give the print layout a frame to apply before opening the native print dialog.
    requestAnimationFrame(() => window.print());
  });
  window.addEventListener("afterprint", restoreTreeAfterPrint);
  render();
})();
