/* ========================================================
   noteExtension.js – PDF.js (v5.3.31) ノート拡張
   Robust Undo / Redo：create, move, delete, update
   ======================================================== */

/* ---------- グローバル ---------- */
let selected = null;                    // 現在選択ノート
const undoStack = [];                   // Undo スタック
const redoStack = [];                   // Redo スタック
const HANDLE = 12;                      // リサイズ判定幅(px)

/* ---------- 汎用 ---------- */
const $ = id => document.getElementById(id) ?? (()=>{throw`#${id}`} )();

/* ========= 操作オブジェクト ========= */
const OP = {
  create: note             => ({ action:'create', note }),
  delete: (note, parent)   => ({ action:'delete', note, parent }),
  move  : (note, fromX,fromY,toX,toY)=>({ action:'move', note, fromX,fromY,toX,toY }),
  update: (note, prev, next)=>({ action:'update', note, prev, next })
};

/* ========= Command 実行 ========= */
function exec(op, reverse = false) {
  const { action, note } = op;
  switch (action) {
    case 'create':
      reverse ? note.remove() : $('noteLayer').appendChild(note);
      break;
    case 'delete':
      reverse ? op.parent.appendChild(note) : note.remove();
      break;
    case 'move': {
      const { fromX, fromY, toX, toY } = op;
      note.style.left = reverse ? fromX : toX;
      note.style.top  = reverse ? fromY : toY;
      break;
    }
    case 'update':
      note.textContent = reverse ? op.prev : op.next;
      break;
  }
}

/* ========= 逆操作生成 ========= */
function invert(op) {
  const inv = { ...op };
  switch (op.action) {
    case 'create': inv.action='delete';  inv.parent = op.note.parentElement; break;
    case 'delete': inv.action='create'; break;
    case 'move':
      [inv.fromX,inv.toX] = [inv.toX,inv.fromX];
      [inv.fromY,inv.toY] = [inv.toY,inv.fromY];
      break;
    case 'update':
      [inv.prev,inv.next] = [inv.next,inv.prev];
      break;
  }
  return inv;
}

/* ========= 履歴 push ========= */
function doOp(op) {
  exec(op);                     // 実行
  undoStack.push(invert(op));   // 逆操作を積む
  redoStack.length = 0;         // Redo クリア
}

/* ========= Undo / Redo ========= */
const undo = () => {
  const op = undoStack.pop(); if (!op) return;
  exec(op, true); redoStack.push(invert(op));
};
const redo = () => {
  const op = redoStack.pop(); if (!op) return;
  exec(op);      undoStack.push(invert(op));
};

/* ========= 選択 ========= */
const select = n => { selected?.classList.remove('selected'); selected=n; n?.classList.add('selected'); };

/* ========= 内容確定 ========= */
function commit(note) {
  if (!note || note.dataset.editing !== 'true') return;
  const prev = note.dataset.origText, next = note.textContent;
  if (prev !== next) doOp(OP.update(note, prev, next));
  note.dataset.editing='false'; note.dataset.origText = next;
}

/* ========= ノート生成 ========= */
function addNote(x, y) {
  const note = document.createElement('div');
  note.className = 'note';
  note.contentEditable = 'true';
  note.textContent = 'ノート';
  note.style.left = `${x}px`;
  note.style.top  = `${y}px`;
  note.dataset.editing='false';
  note.dataset.origText = note.textContent;

  /* 選択 */
  note.onclick = e => { e.stopPropagation(); select(note); };

  /* 編集トラッキング */
  note.onfocus = () => { note.dataset.editing='true'; note.dataset.origText = note.textContent; };
  note.onblur  = () => commit(note);

  enableDrag(note);
  $('noteLayer').appendChild(note);
  note.focus();

  doOp(OP.create(note));
}

/* ========= ドラッグ ========= */
function enableDrag(note) {
  let sx, sy, fromX, fromY;
  note.onmousedown = e => {
    if (e.button) return;
    commit(note);                                         // 確定
    if (note.clientWidth-e.offsetX < HANDLE && note.clientHeight-e.offsetY < HANDLE) return;

    const cs = getComputedStyle(note);
    fromX = cs.left; fromY = cs.top;
    sx = e.clientX; sy = e.clientY;

    document.onmousemove = mv;
    document.onmouseup   = up;
  };
  const mv = e => {
    note.style.left = `${parseFloat(fromX)+e.clientX-sx}px`;
    note.style.top  = `${parseFloat(fromY)+e.clientY-sy}px`;
  };
  const up = () => {
    document.onmousemove = document.onmouseup = null;
    const toX = note.style.left, toY = note.style.top;
    if (toX !== fromX || toY !== fromY) doOp(OP.move(note, fromX,fromY,toX,toY));
  };
}

/* ========= 初期化 ========= */
function init() {
  const vc = $('viewerContainer'), nl=$('noteLayer');
  let btn = $('addNoteButton') || (()=>{const b=document.createElement('button');b.id='addNoteButton';b.textContent='📝';b.className='toolbarButton';$('toolbarViewerLeft').appendChild(b);return b;})();

  let addMode=false;
  btn.onclick=()=>{addMode=!addMode;vc.style.cursor=addMode?'crosshair':'default';};

  vc.addEventListener('click',e=>{
    if(!addMode){select(null);return;}
    const r=vc.getBoundingClientRect();
    addNote(e.clientX-r.left+vc.scrollLeft, e.clientY-r.top+vc.scrollTop);
    addMode=false;vc.style.cursor='default';
  },true);

  document.addEventListener('keydown',e=>{
    if(selected) commit(selected);                 // 先に確定
    if(e.key==='Delete'&&selected){doOp(OP.delete(selected,selected.parentElement));select(null);return;}
    const ctrl=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();
    if(ctrl&&k==='z'&&!e.shiftKey){undo();return;}
    if(ctrl&&(k==='y'||(k==='z'&&e.shiftKey))){redo();return;}
  });

  const sync=()=>{const v=$('viewer');nl.style.width=`${v.scrollWidth}px`;nl.style.height=`${v.scrollHeight}px`;};
  PDFViewerApplication.eventBus.on('pagesinit',sync);
  PDFViewerApplication.eventBus.on('scalechanging',sync);
  window.addEventListener('resize',sync); sync();
}

/* ========= 起動 ========= */
(PDFViewerApplication?.initializedPromise ?? new Promise(r=>window.addEventListener('webviewerloaded',r,{once:true}))).then(init);
