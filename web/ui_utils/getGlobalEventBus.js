import EventBus from './EventBus';

let globalEventBus = null;
export default function getGlobalEventBus(dispatchToDOM = false) {
  if (!globalEventBus) {
    globalEventBus = new EventBus({ dispatchToDOM, });
  }
  return globalEventBus;
}
