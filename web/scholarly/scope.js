import {getFilter, onFilterChange} from "./filter.js";

let FULL_SCOPE_OPTION;
let SELECT;

const options = new Map();
let scope = null;

export function initScope() {
  SELECT = document.getElementById("scholarlyScope");
  FULL_SCOPE_OPTION = document.getElementById("scholarlyScopeFull");

  createOptions();
  SELECT.addEventListener("input", onSelect);

  onFilterChange(() => {
    SELECT.value = "full";
    onSelect();
    if(getFilter() == null) {
      SELECT.setAttribute('disabled', 'true');
    } else {
      SELECT.removeAttribute('disabled');
    }
  });

  SELECT.value = window.scholarlyCurrentCollection ?? "full";
  onSelect();
}

function onSelect() {
  let value = SELECT.value;
  if(value === 'full') {
    scope = null;
  } else {
    scope = parseInt(value);
  }
  console.log("Selected scope:", scope);
}

export function getScope() {
  return scope;
}

function createOptions() {
  window.scholarlyCollections.forEach(col => {
    let opt = document.createElement("option");
    opt.setAttribute("value", col.id.toString());
    opt.innerHTML = col.name;
    options.set(col.id, opt);
    SELECT.appendChild(opt);
  });
}
