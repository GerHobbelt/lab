/**
 * isD3Listner : is a given listener a D3 listener?
 * @param {listener} the listener to check for D3
 */
var isD3Listner = function(listener) {
  // D3 events don't use "off", they issue another 'on' with same name
  // see: https://github.com/mbostock/d3/wiki/Internals#wiki-dispatch_on
  if (typeof listener.off !== 'function') {
    return true;
  }
  return false;
};

/**
 * ListeningPool:  A simple helper to keep track of the events you
 * are listening too.
 *
 * @constructor
 *
 * @param {Namespace} our event namespace. Required for D3 events,
 * handy for JQuery event types.
 */
function ListeningPool(namespace) {
  this._nameSpace = namespace;
  this.registeredListeners = [];

  this._nameSpaced = function(eventName) {
    return eventName + "." + this._nameSpace;
  };
}

/**
 * listen: register a new listener on a speaker.
 *
 * @param {speaker}  object we are listening too.
 * @param {eventName} the event type we are listening for
 * @param {func} callback to invoke when event is fired.
 */
ListeningPool.prototype.listen = function(speaker, eventName, func) {
  var eventKey = this._nameSpaced(eventName);
  var listeningRecord = {
    speaker: speaker,
    eventName: eventKey
  };
  speaker.on(eventKey, func);
  this.registeredListeners.push(listeningRecord);
};

/**
 * remove : remove a listener from the registeredListeners
 * @param {listener} the listener to remove
 */
ListeningPool.prototype.remove = function(listener) {
  if (isD3Listner(listener)) {
    listener.speaker.on(listener.eventName, null); // How D3 removes listeners...
  } else {
    listener.speaker.off(listener.eventName); // How JQuery removes listeners..
  }
};

/**
 * removeAll : remove ourself as a listener from all our speakers.
 * (We could simply use JQuery off(/namespace/) if we stick to JQ events)
 */
ListeningPool.prototype.removeAll = function() {
  while (this.registeredListeners.length > 0) {
    this.remove(this.registeredListeners.pop());
  }
};

export default ListeningPool;
