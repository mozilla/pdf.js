/* ==========================================================
   noteExtension.js – PDF.js (v5.3.31) ノート拡張
   ─ 作成 / 移動 / 削除 / 更新  +  Undo (Ctrl/Cmd+Z) & Redo
   ========================================================== */

/* ---------- グローバル状態 ---------- */
let selectedNote = null;            // 現在選択中のノート
const undoStack  = [];              // Undo スタック
const redoStack  = [];              // Redo スタック
let   isReplay   = false;           // Undo / Redo 実行中フラグ
const HANDLE = 12;                  // リサイズ判定幅(px)

/* ---------- ヘルパ ---------- */
const $ = id => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found`);
  return el;
};

/* ----------------------------------------------------------
   1. 変更確定ユーティリティ
---------------------------------------------------------- */
function commitUpdate(note) {
  if (note?.dataset.editing === 'true') {
    const prevText = note.dataset.origText;
    const curText  = note.textContent;
    if (prevText !== curText) {
      pushHistory({ type: 'update', node: note, prevText });
      note.dataset.origText = curText;     // 次回の基準
    }
    note.dataset.editing = 'false';
  }
}

/* ----------------------------------------------------------
   2. 履歴スタック操作
---------------------------------------------------------- */
function pushHistory(op) {
  if (isReplay) return;             // Undo/Redo 実行中は積まない
  undoStack.push(op);
  redoStack.length = 0;             // 新操作が入ると Redo 無効化
}

/* ----------------------------------------------------------
   3. ドラッグ機能
---------------------------------------------------------- */
function enableDrag(note) {
  note.classList.add('draggable');

  let sX, sY, oLeft, oTop;

  note.addEventListener('mousedown', e => {
    if (e.button !== 0) return;

    /* 編集確定してからドラッグ */
    commitUpdate(note);

    /* リサイズ領域ならドラッグしない */
    if (
      note.clientWidth  - e.offsetX < HANDLE &&
      note.clientHeight - e.offsetY < HANDLE
    ) return;

    e.stopPropagation();
    sX = e.clientX;
    sY = e.clientY;
    const st = window.getComputedStyle(note);
    oLeft = parseFloat(st.left);
    oTop  = parseFloat(st.top);

    const onMove = ev => {
      note.style.left = `${oLeft + (ev.clientX - sX)}px`;
      note.style.top  = `${oTop  + (ev.clientY - sY)}px`;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      pushHistory({ type:'move', node:note, prevLeft:oLeft, prevTop:oTop });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

/* ----------------------------------------------------------
   4. ノート生成
---------------------------------------------------------- */
function createNoteAt(x, y, layer) {
  const note = document.createElement('div');
  note.className = 'note';
  note.contentEditable = 'true';
  note.textContent = 'ノート';
  note.style.left = `${x}px`;
  note.style.top  = `${y}px`;
  note.dataset.editing = 'false';
  note.dataset.origText = note.textContent;

  /* 選択ハンドラ */
  note.addEventListener('click', e => {
    e.stopPropagation();
    if (selectedNote) selectedNote.classList.remove('selected');
    selectedNote = note;
    note.classList.add('selected');
  });

  /* 編集開始・終了フック */
  note.addEventListener('focus', () => {
    note.dataset.editing = 'true';
    note.dataset.origText = note.textContent;
  });
  note.addEventListener('blur',  () => commitUpdate(note));

  enableDrag(note);
  layer.appendChild(note);
  note.focus();

  pushHistory({ type:'create', node:note });
}

/* ----------------------------------------------------------
   5. Undo / Redo 実装
---------------------------------------------------------- */
function selectNode(node) {
  if (selectedNote) selectedNote.classList.remove('selected');
  selectedNote = node;
  node.classList.add('selected');
}

function applyUndo() {
  const op = undoStack.pop();
  if (!op) return;
  isReplay = true;

  switch (op.type) {
    case 'create':
      op.node.remove();
      redoStack.push(op);
      break;
    case 'delete':
      op.parent.appendChild(op.node);
      redoStack.push(op);
      break;
    case 'move':
      redoStack.push({ ...op, nextLeft: op.node.style.left, nextTop: op.node.style.top });
      op.node.style.left = `${op.prevLeft}px`;
      op.node.style.top  = `${op.prevTop}px`;
      break;
    case 'update':
      redoStack.push({ ...op, nextText: op.node.textContent });
      op.node.textContent = op.prevText;
      break;
  }
  selectNode(op.node);
  isReplay = false;
}

function applyRedo() {
  const op = redoStack.pop();
  if (!op) return;
  isReplay = true;

  switch (op.type) {
    case 'create':
      $('noteLayer').appendChild(op.node);
      undoStack.push(op);
      break;
    case 'delete':
      op.node.remove();
      undoStack.push(op);
      break;
    case 'move':
      undoStack.push({ ...op, prevLeft: op.node.style.left, prevTop: op.node.style.top });
      op.node.style.left = op.nextLeft;
      op.node.style.top  = op.nextTop;
      break;
    case 'update':
      undoStack.push({ ...op, prevText: op.node.textContent });
      op.node.textContent = op.nextText;
      break;
  }
  selectNode(op.node);
  isReplay = false;
}

/* ----------------------------------------------------------
   6. メイン初期化
---------------------------------------------------------- */
function initNoteExtension() {
  const viewerContainer = $('viewerContainer');
  const noteLayer       = $('noteLayer');

  /* ボタン生成（無ければ補完） */
  let addBtn = document.getElementById('addNoteButton');
  if (!addBtn) {
    const tb = $('toolbarViewerLeft');
    addBtn = document.createElement('button');
    addBtn.id = 'addNoteButton';
    addBtn.className = 'toolbarButton';
    addBtn.title = 'Add note';
    addBtn.textContent = '📝';
    tb.appendChild(addBtn);
  }

  /* 追加モード */
  let addMode = false;
  addBtn.addEventListener('click', () => {
    addMode = !addMode;
    viewerContainer.style.cursor = addMode ? 'crosshair' : 'default';
  });

  /* クリック処理 */
  viewerContainer.addEventListener('click', e => {
    if (!addMode) {
      if (selectedNote) selectedNote.classList.remove('selected');
      selectedNote = null;
      return;
    }
    const rect = viewerContainer.getBoundingClientRect();
    const x = e.clientX - rect.left + viewerContainer.scrollLeft;
    const y = e.clientY - rect.top  + viewerContainer.scrollTop;
    createNoteAt(x, y, noteLayer);
    addMode = false;
    viewerContainer.style.cursor = 'default';
  }, true);

  /* Delete / Undo / Redo */
  document.addEventListener('keydown', e => {
    /* 編集確定 → その後のキー処理 */
    if (selectedNote) commitUpdate(selectedNote);

    /* Delete */
    if (e.key === 'Delete' && selectedNote) {
      pushHistory({ type:'delete', node:selectedNote, parent:selectedNote.parentElement });
      selectedNote.remove();
      selectedNote = null;
      return;
    }

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const isUndo = key === 'z' && ctrl && !e.shiftKey;
    const isRedo = (key === 'y' && ctrl) || (key === 'z' && ctrl && e.shiftKey);

    if (isUndo) { applyUndo(); return; }
    if (isRedo) { applyRedo(); return; }
  });

  /* レイヤーサイズ同期 */
  const syncLayer = () => {
    const viewer = $('viewer');
    noteLayer.style.width  = `${viewer.scrollWidth}px`;
    noteLayer.style.height = `${viewer.scrollHeight}px`;
  };
  PDFViewerApplication.eventBus.on('pagesinit', syncLayer);
  PDFViewerApplication.eventBus.on('scalechanging', syncLayer);
  window.addEventListener('resize', syncLayer);
  syncLayer();
}

/* ----------------------------------------------------------
   7. PDF.js 完全ロード後に実行
---------------------------------------------------------- */
if (window.PDFViewerApplication?.initializedPromise) {
  PDFViewerApplication.initializedPromise.then(initNoteExtension);
} else {
  window.addEventListener('webviewerloaded', initNoteExtension, { once:true });
}
