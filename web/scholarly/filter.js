window.scholarlyCollections = [
  {name: "Collection 1", id: 1},
  {name: "Collection 2", id: 2},
  {name: "Collection 3", id: 3},
  {name: "Collection 4", id: 4},
  {name: "Collection 5", id: 5},
]

window.scholarlyAnnotations = [
  { id: 1, ownerId: 1, entryId: 1, collectionId: 1, color: "#ff0000", startPosition: { page: 1, x: 0, y: 0 }, endPosition: { page: 1, x: 100, y: 100 }, type: "highlight" },
  { id: 2, ownerId: 1, entryId: 1, collectionId: 1, color: "#ff0000", content: "Hello World!", position: { page: 1, x: 150, y: 150}, type: "stickyNote"  },
]

const SELECT = document.getElementById("scholarlyFilter");
const ALL_OPTION = document.getElementById("scholarlyFilterAll");
const HIDDEN_OPTION = document.getElementById("scholarlyDisplayOption");

const options = new Map();
let filter = [];

export function initFilter() {
  createOptions();
  updateFilter();
  SELECT.addEventListener("input", onSelect)
}

// Returns an array of collection IDs (numbers) which are filtered.
// (Returns all collections if all annotations should be displayed.)
// Returns an empty array if only full-scope annotations should be displayed.
// Returns null if no annotations should be displayed.
export function getFilter() {
  return [...filter];
}

// run when an option is selected
function onSelect() {
  if (SELECT.value === 'all') {
    filter = [];
  } else {
    let colID = parseInt(SELECT.value);
    if (filter.includes(colID)) {
      filter = filter.filter(id => id !== colID);
    } else {
      filter.push(colID);
    }
  }
  updateFilter();
  SELECT.value = "null";
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
  for(let [colID, option] of options.entries()) {
    option.style.color = filter.includes(colID) ? 'black' : 'gray';
  }

  if(filter.length === 0) {
    ALL_OPTION.style.color = 'black';
    HIDDEN_OPTION.innerHTML = 'All Collections'
  } else {
    ALL_OPTION.style.color = 'gray';
    HIDDEN_OPTION.innerHTML = `${filter.length} Selected`
  }
}
