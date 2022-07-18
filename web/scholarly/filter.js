let SELECT;
let ALL_OPTION;
let NOTHING_OPTION;
let HIDDEN_OPTION;

const options = new Map();
let filter = [];
let handlers = [];

export function initFilter() {
  SELECT = document.getElementById("scholarlyFilter");
  ALL_OPTION = document.getElementById("scholarlyFilterAll");
  NOTHING_OPTION = document.getElementById("scholarlyFilterNothing");
  HIDDEN_OPTION = document.getElementById("scholarlyDisplayOption");
  filter = window.scholarlyCollections.map(col => col.id);

  createOptions();
  updateFilter();
  SELECT.addEventListener("input", onSelect)
}

// Returns an array of collection IDs (numbers) which are filtered.
// (Returns all collections if all annotations should be displayed.)
// Returns an empty array if only full-scope annotations should be displayed.
// Returns null if no annotations should be displayed.
export function getFilter() {
  return filter != null ? [...filter] : null;
}

export function onFilterChange(handler) {
  handlers.push(handler);
}

// returns true or false, indicating if an annotation with the given
// collectionId should be shown or not.
export function shouldShow(collectionId) {
  // all annotations are hidden
  if (filter == null) {
    return false;
  }

  // otherwise, show full-scope annotations
  if (collectionId == null) {
    return true;
  }

  // only show if it's active
  return filter.includes(collectionId);
}

// run when an option is selected
function onSelect() {
  if (SELECT.value === 'all') {
    filter = window.scholarlyCollections.map(col => col.id);
  } else if (SELECT.value === 'nothing') {
    filter = null;
  } else {
    let colID = parseInt(SELECT.value);
    if (filter == null) {
      filter = [];
    }
    if (filter.includes(colID)) {
      filter = filter.filter(id => id !== colID);
    } else {
      filter.push(colID);
    }
  }
  updateFilter();
  SELECT.value = "null";
  handlers.forEach(h => h());
}

// creates an <option> for every collection in the dropdown
function createOptions() {
  window.scholarlyCollections.forEach(col => {
    let opt = document.createElement("option");
    opt.setAttribute("value", col.id.toString());
    opt.innerHTML = col.name;
    options.set(col.id, opt);
    SELECT.appendChild(opt);
  })
}

function updateFilter() {
  // set color of options to show if they are selected or not
  for (let [colID, option] of options.entries()) {
    option.style.color = filter?.includes(colID) ? 'black' : 'gray';
  }

  if (filter == null) {
    ALL_OPTION.style.color = 'gray';
    NOTHING_OPTION.style.color = 'black';

    HIDDEN_OPTION.innerHTML = 'Hide Annotations'
  } else if (filter.length === window.scholarlyCollections.length) {
    ALL_OPTION.style.color = 'black';
    NOTHING_OPTION.style.color = 'gray';

    HIDDEN_OPTION.innerHTML = 'All Annotations'
  } else if (filter.length === 0) {
    ALL_OPTION.style.color = 'gray';
    NOTHING_OPTION.style.color = 'gray';
    HIDDEN_OPTION.innerHTML = 'Only Full-Scope'
  } else {
    ALL_OPTION.style.color = 'gray';
    NOTHING_OPTION.style.color = 'gray';

    HIDDEN_OPTION.innerHTML = `${filter.length} Selected`
  }
}
