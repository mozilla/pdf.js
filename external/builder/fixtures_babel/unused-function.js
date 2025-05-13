function usedByUsed() {}
function usedByUnused() {}
function usedByRemovedCode() {}

function used() {
  usedByUsed();
  return;
  usedByRemovedCode();
}
function unused() {
  usedByUnused();
}

used();
