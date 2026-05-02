// ── PALETTES ──────────────────────────────────────────────────────────────────
const PALETTES = {
  pico8: ['#000000','#1D2B53','#7E2553','#008751','#AB5236','#5F574F','#C2C3C7','#FFF1E8','#FF004D','#FFA300','#FFEC27','#00E436','#29ADFF','#83769C','#FF77A8','#FFCCAA'],
  gameboy: ['#0F380F','#306230','#8BAC0F','#9BBC0F'],
  sweetie16: ['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'],
  endesga32: ['#be4a2f','#d77643','#ead4aa','#e4a672','#b86f50','#733e39','#3e2731','#a22633','#e43b44','#f77622','#feae34','#fee761','#63c74d','#3e8948','#265c42','#193c3e','#124e89','#0099db','#2ce8f5','#ffffff','#c0cbdc','#8b9bb4','#5a6988','#3a4466','#262b44','#181425','#ff0044','#68386c','#b55088','#f6757a','#e8b796','#c28569'],
};

// ── STATE ─────────────────────────────────────────────────────────────────────
let CW = 32, CH = 32, zoom = 14;
let frames = [], currentFrame = 0;
let tool = 'pencil', brushSize = 1;
let primaryColor = '#7c3aed', secondaryColor = '#06b6d4';
let showGrid = true, onionSkin = false;
let mirrorX = false, mirrorY = false;
let playing = false, fps = 8, playTimer = null, loopAnim = true;
let isDrawing = false, drawBtn = 0;
let startX = -1, startY = -1, lastX = -1, lastY = -1;
let undoStack = [], redoStack = [];
let recentColors = [];
let currentPalette = 'pico8';

// ── DOM REFS ──────────────────────────────────────────────────────────────────
const mainCanvas = document.getElementById('main-canvas');
const ctx = mainCanvas.getContext('2d');
const container = document.getElementById('canvas-container');
const framesStrip = document.getElementById('frames-strip');
const zoomLabel = document.getElementById('zoom-label');
const fpsSlider = document.getElementById('fps-slider');
const fpsLabel = document.getElementById('fps-label');
const btnPlay = document.getElementById('btn-play');
const btnGrid = document.getElementById('btn-grid');
const btnOnion = document.getElementById('btn-onion');
const btnLoop = document.getElementById('btn-loop');
const primaryInput = document.getElementById('primary-color-input');
const secondaryInput = document.getElementById('secondary-color-input');
const swatchPrimary = document.getElementById('swatch-primary');
const swatchSecondary = document.getElementById('swatch-secondary');
const paletteGrid = document.getElementById('palette-grid');
const recentEl = document.getElementById('recent-colors');
const modalOverlay = document.getElementById('modal-overlay');
const progressFill = document.getElementById('progress-fill');
const modalStatus = document.getElementById('modal-status');
const modalClose = document.getElementById('modal-close');

// ── FRAME DATA ────────────────────────────────────────────────────────────────
function newFrameData() { return new Uint8ClampedArray(CW * CH * 4); }
function cloneFrame(f) { return new Uint8ClampedArray(f); }

function getPixel(f, x, y) {
  const i = (y * CW + x) * 4;
  return [f[i], f[i+1], f[i+2], f[i+3]];
}
function setPixel(f, x, y, r, g, b, a=255) {
  if (x < 0 || y < 0 || x >= CW || y >= CH) return;
  const i = (y * CW + x) * 4;
  f[i]=r; f[i+1]=g; f[i+2]=b; f[i+3]=a;
}
function clearPixel(f, x, y) { setPixel(f, x, y, 0, 0, 0, 0); }

function hexToRGBA(hex) {
  hex = hex.replace('#','');
  if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16), 255];
}
function rgbaToHex(r,g,b) {
  return '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function render() {
  const W = CW * zoom, H = CH * zoom;
  mainCanvas.width = W; mainCanvas.height = H;
  container.style.width = W + 'px'; container.style.height = H + 'px';
  ctx.clearRect(0, 0, W, H);

  // Onion skin
  if (onionSkin && currentFrame > 0) {
    const prev = frames[currentFrame - 1];
    const imgData = new ImageData(new Uint8ClampedArray(prev), CW, CH);
    const offCtx = Object.assign(document.createElement('canvas'), {width:CW,height:CH}).getContext('2d');
    offCtx.putImageData(imgData, 0, 0);
    ctx.globalAlpha = 0.3;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offCtx.canvas, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }

  // Frame pixels
  const imgData = new ImageData(new Uint8ClampedArray(frames[currentFrame]), CW, CH);
  const offCtx = Object.assign(document.createElement('canvas'), {width:CW,height:CH}).getContext('2d');
  offCtx.putImageData(imgData, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offCtx.canvas, 0, 0, W, H);

  // Grid
  if (showGrid && zoom >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= CW; x++) { ctx.beginPath(); ctx.moveTo(x*zoom,0); ctx.lineTo(x*zoom,H); ctx.stroke(); }
    for (let y = 0; y <= CH; y++) { ctx.beginPath(); ctx.moveTo(0,y*zoom); ctx.lineTo(W,y*zoom); ctx.stroke(); }
  }
}

function renderThumb(idx) {
  const wrap = document.querySelector(`.frame-thumb[data-idx="${idx}"] canvas`);
  if (!wrap) return;
  const tc = wrap.getContext('2d');
  wrap.width = CW; wrap.height = CH;
  const imgData = new ImageData(new Uint8ClampedArray(frames[idx]), CW, CH);
  tc.putImageData(imgData, 0, 0);
}

function renderAllThumbs() {
  frames.forEach((_, i) => renderThumb(i));
}

// ── FRAME UI ──────────────────────────────────────────────────────────────────
function buildFrameStrip() {
  framesStrip.innerHTML = '';
  frames.forEach((_, i) => {
    const div = document.createElement('div');
    div.className = 'frame-thumb' + (i === currentFrame ? ' active' : '');
    div.dataset.idx = i;
    div.innerHTML = `<div class="frame-canvas-wrap"><canvas width="${CW}" height="${CH}"></canvas></div><span class="frame-num">${i+1}</span>`;
    div.addEventListener('click', () => selectFrame(i));
    framesStrip.appendChild(div);
    renderThumb(i);
  });
}

function selectFrame(i) {
  currentFrame = i;
  document.querySelectorAll('.frame-thumb').forEach((el,idx) => el.classList.toggle('active', idx===i));
  render();
}

// ── UNDO/REDO ─────────────────────────────────────────────────────────────────
function snapshot() {
  undoStack.push(frames.map(cloneFrame));
  if (undoStack.length > 40) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(frames.map(cloneFrame));
  frames = undoStack.pop();
  currentFrame = Math.min(currentFrame, frames.length-1);
  buildFrameStrip(); render();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(frames.map(cloneFrame));
  frames = redoStack.pop();
  currentFrame = Math.min(currentFrame, frames.length-1);
  buildFrameStrip(); render();
}

// ── DRAWING TOOLS ─────────────────────────────────────────────────────────────
function paintPixels(px, py, color, erase=false) {
  const half = Math.floor(brushSize/2);
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const nx = px - half + dx, ny = py - half + dy;
      if (erase) clearPixel(frames[currentFrame], nx, ny);
      else { const [r,g,b,a] = hexToRGBA(color); setPixel(frames[currentFrame],nx,ny,r,g,b,a); }
      if (mirrorX) { const mx = CW-1-nx; if (erase) clearPixel(frames[currentFrame],mx,ny); else { const [r,g,b,a]=hexToRGBA(color);setPixel(frames[currentFrame],mx,ny,r,g,b,a);} }
      if (mirrorY) { const my = CH-1-ny; if (erase) clearPixel(frames[currentFrame],nx,my); else { const [r,g,b,a]=hexToRGBA(color);setPixel(frames[currentFrame],nx,my,r,g,b,a);} }
      if (mirrorX && mirrorY) { const mx=CW-1-nx,my=CH-1-ny; if (erase) clearPixel(frames[currentFrame],mx,my); else { const [r,g,b,a]=hexToRGBA(color);setPixel(frames[currentFrame],mx,my,r,g,b,a);} }
    }
  }
}

function floodFill(x, y, fillColor) {
  const f = frames[currentFrame];
  const [tr,tg,tb,ta] = getPixel(f, x, y);
  const [fr,fg,fb,fa] = hexToRGBA(fillColor);
  if (tr===fr && tg===fg && tb===fb && ta===fa) return;
  const stack = [[x,y]];
  const visited = new Uint8Array(CW*CH);
  while (stack.length) {
    const [cx,cy] = stack.pop();
    if (cx<0||cy<0||cx>=CW||cy>=CH||visited[cy*CW+cx]) continue;
    const [r,g,b,a] = getPixel(f,cx,cy);
    if (r!==tr||g!==tg||b!==tb||a!==ta) continue;
    visited[cy*CW+cx]=1;
    setPixel(f,cx,cy,fr,fg,fb,fa);
    stack.push([cx+1,cy],[cx-1,cy],[cx,cy+1],[cx,cy-1]);
  }
}

function bresenham(x0,y0,x1,y1) {
  const pts=[]; let dx=Math.abs(x1-x0),dy=Math.abs(y1-y0);
  let sx=x0<x1?1:-1,sy=y0<y1?1:-1,err=dx-dy;
  while(true){pts.push([x0,y0]);if(x0===x1&&y0===y1)break;let e2=2*err;if(e2>-dy){err-=dy;x0+=sx;}if(e2<dx){err+=dx;y0+=sy;}}
  return pts;
}

// ── COLOR HELPERS ─────────────────────────────────────────────────────────────
function setPrimaryColor(hex) {
  primaryColor = hex;
  primaryInput.value = hex;
  swatchPrimary.style.background = hex;
}
function setSecondaryColor(hex) {
  secondaryColor = hex;
  secondaryInput.value = hex;
  swatchSecondary.style.background = hex;
}
function addRecentColor(hex) {
  recentColors = [hex, ...recentColors.filter(c=>c!==hex)].slice(0,16);
  recentEl.innerHTML = '';
  recentColors.forEach(c => {
    const s = document.createElement('div');
    s.className='recent-swatch'; s.style.background=c; s.title=c;
    s.addEventListener('click',()=>setPrimaryColor(c));
    s.addEventListener('contextmenu',e=>{e.preventDefault();setSecondaryColor(c);});
    recentEl.appendChild(s);
  });
}

function buildPalette() {
  paletteGrid.innerHTML = '';
  PALETTES[currentPalette].forEach(hex => {
    const s = document.createElement('div');
    s.className='palette-swatch'; s.style.background=hex; s.title=hex;
    s.addEventListener('click',()=>{setPrimaryColor(hex);addRecentColor(hex);});
    s.addEventListener('contextmenu',e=>{e.preventDefault();setSecondaryColor(hex);});
    paletteGrid.appendChild(s);
  });
}

// ── CANVAS EVENTS ─────────────────────────────────────────────────────────────
function getXY(e) {
  const rect = mainCanvas.getBoundingClientRect();
  return [Math.floor((e.clientX - rect.left)/zoom), Math.floor((e.clientY - rect.top)/zoom)];
}

mainCanvas.addEventListener('mousedown', e => {
  e.preventDefault();
  isDrawing = true; drawBtn = e.button;
  const [x,y] = getXY(e);
  startX=x; startY=y; lastX=x; lastY=y;
  const color = drawBtn===2 ? secondaryColor : primaryColor;

  if (tool==='eyedropper') {
    const [r,g,b,a] = getPixel(frames[currentFrame],x,y);
    if (a>0) { setPrimaryColor(rgbaToHex(r,g,b)); addRecentColor(rgbaToHex(r,g,b)); }
    isDrawing=false; return;
  }
  if (tool==='fill') {
    snapshot();
    floodFill(x,y,color);
    addRecentColor(color);
    render(); renderThumb(currentFrame); return;
  }
  if (tool==='pencil'||tool==='eraser') {
    snapshot();
    paintPixels(x,y,color,tool==='eraser');
    render(); renderThumb(currentFrame);
  }
});

mainCanvas.addEventListener('mousemove', e => {
  if (!isDrawing) return;
  const [x,y] = getXY(e);
  if (x===lastX && y===lastY) return;
  const color = drawBtn===2 ? secondaryColor : primaryColor;

  if (tool==='pencil'||tool==='eraser') {
    bresenham(lastX,lastY,x,y).forEach(([px,py])=>paintPixels(px,py,color,tool==='eraser'));
    lastX=x; lastY=y;
    render(); renderThumb(currentFrame);
  } else if (tool==='line'||tool==='rect') {
    render(); // re-render clean
    ctx.globalAlpha=1;
    const [r,g,b] = hexToRGBA(color);
    ctx.fillStyle=color;
    if (tool==='line') {
      bresenham(startX,startY,x,y).forEach(([px,py])=>{ctx.fillRect(px*zoom,py*zoom,zoom,zoom);});
    } else {
      const rx=Math.min(startX,x),ry=Math.min(startY,y),rw=Math.abs(x-startX)+1,rh=Math.abs(y-startY)+1;
      ctx.strokeStyle=color; ctx.lineWidth=zoom;
      ctx.strokeRect((rx+0.5)*zoom,(ry+0.5)*zoom,rw*zoom,rh*zoom);
    }
  }
});

mainCanvas.addEventListener('mouseup', e => {
  if (!isDrawing) return;
  const [x,y] = getXY(e);
  const color = drawBtn===2 ? secondaryColor : primaryColor;

  if (tool==='line') {
    snapshot();
    bresenham(startX,startY,x,y).forEach(([px,py])=>paintPixels(px,py,color,false));
    addRecentColor(color);
    render(); renderThumb(currentFrame);
  } else if (tool==='rect') {
    snapshot();
    const rx=Math.min(startX,x),ry=Math.min(startY,y),rw=Math.abs(x-startX),rh=Math.abs(y-startY);
    for(let dx=0;dx<=rw;dx++){paintPixels(rx+dx,ry,color);paintPixels(rx+dx,ry+rh,color);}
    for(let dy=0;dy<=rh;dy++){paintPixels(rx,ry+dy,color);paintPixels(rx+rw,ry+dy,color);}
    addRecentColor(color);
    render(); renderThumb(currentFrame);
  }
  isDrawing=false;
});

mainCanvas.addEventListener('contextmenu',e=>e.preventDefault());
mainCanvas.addEventListener('mouseleave',()=>{if(isDrawing&&(tool==='pencil'||tool==='eraser'))isDrawing=false;});

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:160px;left:50%;transform:translateX(-50%);background:#7c3aed;color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;z-index:999;pointer-events:none;transition:opacity .4s'; document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.style.opacity = '0', 1800);
}

// ── PLAYBACK ──────────────────────────────────────────────────────────────────
function togglePlay() {
  if (frames.length < 2) { showToast('Add more frames to animate! (+ Frame)'); return; }
  clearInterval(playTimer);
  playing = !playing;
  btnPlay.textContent = playing ? '⏸ Pause' : '▶ Play';
  btnPlay.classList.toggle('playing', playing);
  if (playing) {
    let framesSinceReset = 0;
    playTimer = setInterval(() => {
      currentFrame = (currentFrame + 1) % frames.length;
      framesSinceReset++;
      if (!loopAnim && currentFrame === 0 && framesSinceReset >= frames.length) {
        clearInterval(playTimer); playing = false;
        btnPlay.textContent = '▶ Play'; btnPlay.classList.remove('playing'); return;
      }
      selectFrame(currentFrame);
    }, Math.round(1000 / fps));
  }
}

// ── FRAME MANAGEMENT ─────────────────────────────────────────────────────────
function addFrame() { snapshot(); frames.push(newFrameData()); currentFrame=frames.length-1; buildFrameStrip(); render(); }
function dupFrame() { snapshot(); frames.splice(currentFrame+1,0,cloneFrame(frames[currentFrame])); currentFrame++; buildFrameStrip(); render(); }
function delFrame() { if(frames.length===1)return; snapshot(); frames.splice(currentFrame,1); currentFrame=Math.min(currentFrame,frames.length-1); buildFrameStrip(); render(); }
function moveFrame(dir) { const n=currentFrame+dir; if(n<0||n>=frames.length)return; snapshot(); [frames[currentFrame],frames[n]]=[frames[n],frames[currentFrame]]; currentFrame=n; buildFrameStrip(); render(); }

// ── CANVAS RESIZE ─────────────────────────────────────────────────────────────
function resizeCanvas(newW, newH) {
  snapshot();
  const newFrames = frames.map(f => {
    const nf = newFrameData();
    // We need a temp with new dimensions
    return nf; // clear on resize
  });
  CW=newW; CH=newH;
  frames=frames.map(()=>newFrameData());
  buildFrameStrip(); render();
}

// ── INLINE GIF ENCODER (no CDN worker needed) ────────────────────────────────
function lzwCompress(pixels, minSize) {
  const clear = 1 << minSize, eoi = clear + 1;
  let codeSize = minSize + 1, nextCode = eoi + 1;
  let table = new Map();
  const reset = () => { table = new Map(); codeSize = minSize + 1; nextCode = eoi + 1; };
  const out = []; let buf = 0, bits = 0;
  const emit = (code) => {
    buf |= code << bits; bits += codeSize;
    while (bits >= 8) { out.push(buf & 0xFF); buf >>>= 8; bits -= 8; }
  };
  emit(clear);
  let prefix = pixels[0];
  for (let i = 1; i < pixels.length; i++) {
    const s = pixels[i], key = `${prefix}_${s}`;
    if (table.has(key)) { prefix = table.get(key); }
    else {
      emit(prefix);
      if (nextCode <= 4095) { table.set(key, nextCode++); if (nextCode > (1<<codeSize) && codeSize < 12) codeSize++; }
      else { emit(clear); reset(); }
      prefix = s;
    }
  }
  emit(prefix); emit(eoi);
  if (bits > 0) out.push(buf & 0xFF);
  return out;
}

function buildGIF(rawFrames, w, h, delayMs) {
  const palette = [{r:0,g:0,b:0}]; // index 0 = transparent
  const cIdx = new Map();
  for (const f of rawFrames) {
    for (let i = 0; i < f.length; i += 4) {
      if (f[i+3] < 128) continue;
      const k = `${f[i]},${f[i+1]},${f[i+2]}`;
      if (!cIdx.has(k) && palette.length < 256) { cIdx.set(k, palette.length); palette.push({r:f[i],g:f[i+1],b:f[i+2]}); }
    }
  }
  let cb = 1; while ((1<<cb) < palette.length) cb++; cb = Math.max(cb, 2);
  while (palette.length < (1<<cb)) palette.push({r:0,g:0,b:0});
  const o = [], wb = (...b) => o.push(...b), ws = s => { for(const c of s) o.push(c.charCodeAt(0)); }, ww = n => o.push(n&0xFF,(n>>8)&0xFF);
  ws('GIF89a'); ww(w); ww(h); wb(0x80|((cb-1)<<4)|(cb-1)); wb(0); wb(0);
  for (const {r,g,b} of palette) wb(r,g,b);
  ws('\x21\xFF\x0BNETSCAPE2.0\x03\x01'); ww(0); wb(0);
  const lzwMin = Math.max(cb, 2);
  const d10 = Math.max(1, Math.round(delayMs/10));
  for (const f of rawFrames) {
    const idx = new Uint8Array(w*h);
    for (let i = 0; i < w*h; i++) {
      if (f[i*4+3]<128) { idx[i]=0; continue; }
      const k = `${f[i*4]},${f[i*4+1]},${f[i*4+2]}`; idx[i] = cIdx.has(k)?cIdx.get(k):0;
    }
    wb(0x21,0xF9,0x04,0x05); ww(d10); wb(0); wb(0);
    wb(0x2C); ww(0); ww(0); ww(w); ww(h); wb(0);
    wb(lzwMin);
    const comp = lzwCompress(idx, lzwMin);
    let p = 0; while (p < comp.length) { const n=Math.min(255,comp.length-p); wb(n); for(let i=0;i<n;i++) wb(comp[p+i]); p+=n; } wb(0);
  }
  wb(0x3B);
  return new Uint8Array(o);
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function showModal(title) { document.getElementById('modal-title').textContent=title; modalOverlay.style.display='flex'; progressFill.style.width='0%'; modalStatus.textContent='Preparing…'; modalClose.style.display='none'; }
function hideModal() { modalOverlay.style.display='none'; }

function exportPNG() {
  const off = Object.assign(document.createElement('canvas'),{width:CW,height:CH});
  const tc = off.getContext('2d');
  tc.putImageData(new ImageData(new Uint8ClampedArray(frames[currentFrame]),CW,CH),0,0);
  const a = document.createElement('a'); a.href=off.toDataURL('image/png'); a.download='pixelforge_frame.png'; a.click();
}

function exportGIF() {
  showModal('Exporting GIF…');
  modalStatus.textContent = 'Encoding frames…';
  progressFill.style.width = '30%';
  setTimeout(() => {
    try {
      const scale = Math.max(1, Math.floor(256/CW));
      const W = CW*scale, H = CH*scale;
      const scaled = frames.map(f => {
        const src = Object.assign(document.createElement('canvas'),{width:CW,height:CH});
        src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f),CW,CH),0,0);
        const dst = Object.assign(document.createElement('canvas'),{width:W,height:H});
        const dc = dst.getContext('2d'); dc.imageSmoothingEnabled=false; dc.drawImage(src,0,0,W,H);
        return dc.getImageData(0,0,W,H).data;
      });
      progressFill.style.width = '60%';
      const gifBytes = buildGIF(scaled, W, H, Math.round(1000/fps));
      progressFill.style.width = '100%';
      modalStatus.textContent = 'Done! Downloading…';
      modalClose.style.display = 'block';
      const blob = new Blob([gifBytes], {type:'image/gif'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='pixelforge.gif'; a.click();
    } catch(e) {
      modalStatus.textContent = 'Error: ' + e.message;
      modalClose.style.display = 'block';
    }
  }, 50);
}

// ── KEYBOARD ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if ((e.ctrlKey||e.metaKey) && e.key==='z') { e.preventDefault(); undo(); return; }
  if ((e.ctrlKey||e.metaKey) && (e.key==='y'||e.key==='Z')) { e.preventDefault(); redo(); return; }
  const map = {b:'pencil',e:'eraser',f:'fill',i:'eyedropper',l:'line',r:'rect'};
  if (map[e.key]) setActiveTool(map[e.key]);
  if (e.key==='g') btnGrid.click();
  if (e.key==='o') btnOnion.click();
  if (e.key==='x') { const tmp=primaryColor; setPrimaryColor(secondaryColor); setSecondaryColor(tmp); }
  if (e.key==='=' || e.key==='+') zoomIn();
  if (e.key==='-') zoomOut();
  if (e.key===' ') { e.preventDefault(); togglePlay(); }
});

// ── TOOL SWITCHING ────────────────────────────────────────────────────────────
function setActiveTool(t) {
  tool = t;
  document.querySelectorAll('.tool-btn').forEach(el => el.classList.toggle('active', el.dataset.tool===t));
}

// ── ZOOM ──────────────────────────────────────────────────────────────────────
const ZOOMS = [2,3,4,6,8,10,12,14,16,20,24,32];
function zoomIn() { const i=ZOOMS.indexOf(zoom); if(i<ZOOMS.length-1){zoom=ZOOMS[i+1];} zoomLabel.textContent=zoom+'×'; render(); }
function zoomOut() { const i=ZOOMS.indexOf(zoom); if(i>0){zoom=ZOOMS[i-1];} zoomLabel.textContent=zoom+'×'; render(); }

// ── INIT ──────────────────────────────────────────────────────────────────────
function init() {
  frames = [newFrameData()];
  currentFrame = 0;
  setPrimaryColor('#7c3aed');
  setSecondaryColor('#06b6d4');
  buildPalette();
  buildFrameStrip();
  render();

  // Tool buttons
  document.querySelectorAll('.tool-btn').forEach(btn => btn.addEventListener('click', () => setActiveTool(btn.dataset.tool)));
  // Size buttons
  document.querySelectorAll('.size-btn').forEach(btn => btn.addEventListener('click', () => {
    brushSize=parseInt(btn.dataset.size);
    document.querySelectorAll('.size-btn').forEach(b=>b.classList.toggle('active',b===btn));
  }));

  // Header controls
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);
  btnGrid.addEventListener('click', () => { showGrid=!showGrid; btnGrid.classList.toggle('on',showGrid); render(); });
  btnOnion.addEventListener('click', () => { onionSkin=!onionSkin; btnOnion.classList.toggle('on',onionSkin); render(); });
  btnLoop.addEventListener('click', () => { loopAnim=!loopAnim; btnLoop.classList.toggle('on',loopAnim); });
  btnPlay.addEventListener('click', togglePlay);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-mirror-x').addEventListener('click', e => { mirrorX=!mirrorX; e.currentTarget.classList.toggle('on',mirrorX); });
  document.getElementById('btn-mirror-y').addEventListener('click', e => { mirrorY=!mirrorY; e.currentTarget.classList.toggle('on',mirrorY); });

  fpsSlider.addEventListener('input', () => { fps=parseInt(fpsSlider.value); fpsLabel.textContent=fps; if(playing){clearInterval(playTimer);togglePlay();togglePlay();} });

  // Canvas size
  document.getElementById('canvas-size-sel').addEventListener('change', e => {
    const v = parseInt(e.target.value);
    if (confirm(`Resize canvas to ${v}×${v}? This will clear all frames.`)) { CW=v; CH=v; frames=[newFrameData()]; currentFrame=0; zoom=Math.max(4,Math.floor(480/v)); zoomLabel.textContent=zoom+'×'; buildFrameStrip(); render(); }
    else e.target.value=CW;
  });

  // Colors
  primaryInput.addEventListener('input', e => setPrimaryColor(e.target.value));
  secondaryInput.addEventListener('input', e => setSecondaryColor(e.target.value));
  swatchPrimary.addEventListener('click', () => primaryInput.click());
  swatchSecondary.addEventListener('click', () => secondaryInput.click());
  document.getElementById('btn-swap-colors').addEventListener('click', () => { const tmp=primaryColor; setPrimaryColor(secondaryColor); setSecondaryColor(tmp); });

  // Palette switch
  document.getElementById('palette-select').addEventListener('change', e => { currentPalette=e.target.value; buildPalette(); });

  // Frame controls
  document.getElementById('btn-add-frame').addEventListener('click', addFrame);
  document.getElementById('btn-dup-frame').addEventListener('click', dupFrame);
  document.getElementById('btn-del-frame').addEventListener('click', delFrame);
  document.getElementById('btn-frame-left').addEventListener('click', () => moveFrame(-1));
  document.getElementById('btn-frame-right').addEventListener('click', () => moveFrame(1));

  // Export
  document.getElementById('btn-export-gif').addEventListener('click', exportGIF);
  document.getElementById('btn-export-png').addEventListener('click', exportPNG);
  modalClose.addEventListener('click', hideModal);
  modalOverlay.addEventListener('click', e => { if(e.target===modalOverlay) hideModal(); });

  // Init toggles
  btnGrid.classList.add('on');
  btnLoop.classList.add('on');
}

window.addEventListener('load', init);
