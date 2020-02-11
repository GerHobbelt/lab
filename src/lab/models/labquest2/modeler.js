/*global define: false */

import $__common_lab_modeler_mixin from 'common/lab-modeler-mixin';
import $__common_property_description from 'common/property-description';
import $____metadata from './metadata';
import $__common_state_machine from 'common/state-machine';
import $__labquest__interface from 'labquest2-interface';
import $____units_definition from './units-definition';
import $__models_sensor_common_i__n_sensor_definitions_connector from 'models/sensor-common/i18n-sensor-definitions-connector';
import $__models_sensor_common_notifier from 'models/sensor-common/notifier';
import $__underscore from 'underscore';

var LabModelerMixin = $__common_lab_modeler_mixin,
  PropertyDescription = $__common_property_description,
  metadata = $____metadata,
  StateMachine = $__common_state_machine,
  labquest2Interface = $__labquest__interface,
  unitsDefinition = $____units_definition,
  getSensorDefinitions = $__models_sensor_common_i__n_sensor_definitions_connector,
  Notifier = $__models_sensor_common_notifier,
  _ = $__underscore;

export default function Model(initialProperties, opt) {
  var i18n = opt.i18n,
    notifier = new Notifier(i18n),

    labModelerMixin,
    propertySupport,
    dispatch,
    stateMachine,
    timeColumn,
    dataColumn,
    selectedSensor,
    sensorName,
    isStopped,
    needsReload,
    time,
    rawSensorValue,
    liveSensorValue,
    lastLiveValueTimestamp,
    liveValueLastChanged,
    stepCounter,
    isPlayable,
    canConnect,
    canTare,
    liveMode,
    canControl,
    hasMultipleSensors,
    isSensorTareable,
    message,
    model;

  var defaultSensorReadingDescription = {
    label: i18n.t("sensor.measurements.sensor_reading"),
    unitAbbreviation: "-",
    format: '.2f',
    min: 0,
    max: 10
  };
  var sensorDefinitions = getSensorDefinitions(i18n);

  function setSensorReadingDescription() {
    var sensorDefinition;
    var description;

    if (dataColumn) {
      sensorDefinition = sensorDefinitions[dataColumn.units];

      if (sensorDefinition) {
        description = {
          label: sensorDefinition.measurementName,
          format: '.2f',
          min: sensorDefinition.minReading,
          max: sensorDefinition.maxReading
        };
        if (unitsDefinition.units[sensorDefinition.measurementType]) {
          description.unitType = sensorDefinition.measurementType;
        } else {
          description.unitAbbreviation = dataColumn.units;
        }
        isSensorTareable = sensorDefinition.tareable;
        sensorName = sensorDefinition.sensorName;
      } else {
        description = {
          label: i18n.t("sensor.measurements.sensor_reading"),
          unitAbbreviation: dataColumn.units,
          format: '.2f',
          min: 0,
          max: 10
        };
        isSensorTareable = true;
        sensorName = dataColumn.units + " sensor";
      }
    } else {
      description = defaultSensorReadingDescription;
      isSensorTareable = false;
      sensorName = "(no sensor)";
    }

    propertySupport.setPropertyDescription('sensorReading',
      new PropertyDescription(unitsDefinition, description));
    propertySupport.setPropertyDescription('liveSensorReading',
      new PropertyDescription(unitsDefinition, description));
  }

  function initializeStateVariables() {
    isStopped = true;
    canConnect = false;
    canControl = labquest2Interface.canControl;
    hasMultipleSensors = false;
    // Set selectedSensor if it hasn't been set yet
    if (typeof(selectedSensor) === "undefined" || selectedSensor === null) {
      selectedSensor = {
        index: -1
      };
    }
    stepCounter = 0;
    time = 0;
    rawSensorValue = undefined;
    liveSensorValue = undefined;
    lastLiveValueTimestamp = 0;
    liveValueLastChanged = 0;
    timeColumn = undefined;
    dataColumn = undefined;
  }

  function checkColumnAgainstSelected(dataset, idx) {
    var colCandidate = dataset.columns[idx];
    if (colCandidate && colCandidate.units === selectedSensor.units) {
      selectedSensor.index = idx;
      return true;
    }
    return false;
  }

  function setColumn() {
    var dataset = labquest2Interface.datasets[0];
    var newDataColumn, sIdx, colCandidate;

    hasMultipleSensors = dataset.columns.length > 2;

    timeColumn = _.find(dataset.columns, function(column) {
      return column.units === 's';
    });

    // TODO When we want to support multiple sensors, this will have to change.
    // Select the column chosen by the user
    sIdx = selectedSensor.index;
    if (sIdx == -1) {
      newDataColumn = _.find(dataset.columns, function(column, idx) {
        if (column.units !== 's') {
          selectedSensor.index = idx;
          selectedSensor.units = column.units;
          sIdx = idx;
          return true;
        }
        return false;
      });
    }
    if (sIdx >= dataset.columns.length && dataset.columns.length > 1) {
      // we seem to be pointing past the number of columns there are. reset to that last column.
      sIdx = dataset.columns.length - 1;

    }
    newDataColumn = dataset.columns[sIdx];
    if (newDataColumn && selectedSensor.units && newDataColumn.units !== selectedSensor.units) {
      // our selected column seems to have changed out from under us.
      // If a sensor was added to the device, it could be one column higher
      if (checkColumnAgainstSelected(dataset, sIdx + 1)) {
        newDataColumn = dataset.columns[sIdx + 1];
      } else if (sIdx > 1 && checkColumnAgainstSelected(dataset, sIdx - 1)) {
        // it wasn't the one after. let's check the one before.
        newDataColumn = dataset.columns[sIdx - 1];
      } else {
        // it seems to be none of them. Reset the selected sensor to the first one.
        newDataColumn = _.find(dataset.columns, function(column, idx) {
          if (column.units !== 's') {
            selectedSensor.index = idx;
            selectedSensor.units = column.units;
            sIdx = idx;
            return true;
          }
          return false;
        });
      }
    }

    dataColumn = newDataColumn;
    if (dataColumn) {
      selectedSensor.units = dataColumn.units;
    }
    setSensorReadingDescription();

    if (!dataColumn) {
      liveSensorValue = undefined;
    }
  }

  function handleData() {
    if (!timeColumn || !dataColumn) {
      return;
    }

    var numberOfValues = Math.min(timeColumn.data.length, dataColumn.data.length);
    for (; stepCounter < numberOfValues; stepCounter++) {
      time = timeColumn.data[stepCounter];
      rawSensorValue = dataColumn.data[stepCounter];
      model.updateAllOutputProperties();
      dispatch.tick();
    }
  }

  function isAllColumnDataReceieved(column) {
    return column.receivedValuesTimeStamp >= column.requestedValuesTimeStamp;
  }

  function isAllDataReceived() {
    return isAllColumnDataReceieved(timeColumn) && (!dataColumn || isAllColumnDataReceieved(dataColumn));
  }

  function connectedSensors() {
    var sensors = [],
      dataset = labquest2Interface.datasets[0],
      i, unit;

    for (i = 0; i < dataset.columns.length; i++) {
      sensors.push(dataset.columns[i].units);
    }
    return sensors;
  }

  model = {

    on: function(type, listener) {
      dispatch.on(type, listener);
    },

    connect: function(address) {
      handle('connect', address);
    },

    start: function() {
      handle('start');
    },

    stop: function() {
      handle('stop');
    },

    tare: function() {
      var oldPlayable = isPlayable;
      isPlayable = false;
      handle('tare');
      isPlayable = oldPlayable;
    },

    willReset: function() {
      dispatch.willReset();
    },

    reset: function() {
      handle('reset');
    },

    reload: function() {
      model.stop();
      model.makeInvalidatingChange(function() {
        needsReload = true;
      });
    },

    isStopped: function() {
      return isStopped;
    },

    stepCounter: function() {
      return stepCounter;
    },

    connectedSensors: connectedSensors,
    getSelectedSensor: function() {
      return selectedSensor.index;
    },
    setSelectedSensor: function(sensorIndex) {
      if (selectedSensor.index !== sensorIndex) {
        selectedSensor.index = sensorIndex;
        selectedSensor.units = null;
        model.properties.tareValue = 0; // Also reset our tare value
        setColumn();
      }
    },

    serialize: function() {
      return "";
    }
  };


  stateMachine = new StateMachine({

    notConnected: {
      enterState: function() {
        message = i18n.t("sensor.messages.not_connected");
        canConnect = true;
      },

      leaveState: function() {
        canConnect = false;
      },

      connect: function(address) {
        labquest2Interface.startPolling(address);
        this.gotoState('connecting');
      }
    },

    connecting: {
      enterState: function() {
        message = i18n.t("sensor.messages.connecting");
        if (labquest2Interface.isConnected) {
          this.gotoState('connected');
        }
      },

      statusErrored: function() {
        this.gotoState('initialConnectionFailure');
      },

      connectionTimedOut: function() {
        this.gotoState('initialConnectionFailure');
      },

      statusReceived: function() {
        this.gotoState('connected');
      },

      sessionChanged: function() {
        // start a new session, stay connecting...
        labquest2Interface.stopPolling();
        labquest2Interface.startPolling();
      }
    },

    initialConnectionFailure: {
      enterState: function() {
        labquest2Interface.stopPolling();
        message = i18n.t("sensor.messages.connection_failed");
        notifier.alert(i18n.t("sensor.messages.connection_failed_labquest2_alert"), {
          OK: function() {
            $(this).dialog("close");
            handle('dismiss');
          }
        });
      },

      dismiss: function() {
        this.gotoState('notConnected');
      }
    },

    connected: {
      enterState: function() {
        message = i18n.t("sensor.messages.connected");
        canTare = true;
        isPlayable = true;
        isStopped = true;

        setColumn();

        if (canControl) {
          this.controlEnabled();
        } else {
          this.controlDisabled();
        }

        if (labquest2Interface.isCollecting) {
          this.gotoState('started');
        }
      },

      leaveState: function() {
        canTare = false;
        isPlayable = false;
      },

      // Give some feedback on the currently selected column from which data will be collected.
      columnAdded: setColumn,
      columnRemoved: setColumn,
      columnTypeChanged: setColumn,
      columnMoved: setColumn,

      tare: function() {
        if (dataColumn) {
          if (liveMode) {
            model.properties.tareValue = dataColumn.liveValue;
          } else {
            canTare = false;
            // Display a message that we need to be in liveMode before we can tare
            notifier.alert(i18n.t("sensor.messages.tare_labquest2_alert"), {
              OK: function() {
                $(this).dialog("close");
                canTare = true;
              }
            });
          }
        }
      },

      // User requests collection
      start: function() {
        // NOTE. Due to architecture switch mid-way, the labquest2Interface layer is turning the
        // start request into a promise, and we're turning it back to events. The lower layer
        // could just ditch promises and emit the corresponding events with no harm. (The state
        // machine prevents almost every practical scenario where we'd see an out-of-date
        // startRequestFailure event while in a state that would respond to it.)
        labquest2Interface.requestStart().catch(function() {
          handle('startRequestFailed');
        });
        this.gotoState('starting');
      },

      controlEnabled: function() {
        message = i18n.t("sensor.messages.connected");
      },

      controlDisabled: function() {
        message = i18n.t("sensor.messages.connected_start_labquest2");
      },

      sessionChanged: function() {
        labquest2Interface.stopPolling();
        labquest2Interface.startPolling();
        this.gotoState('connecting');
      },

      // Collection was started by a third party
      collectionStarted: function() {
        this.gotoState('started');
      }
    },

    starting: {
      enterState: function() {
        message = i18n.t("sensor.messages.starting_data_collection");
        isStopped = false;
        var self = this;
        this._startTimerId = setTimeout(3000, function() {
          self.gotoState('startRequestFailed');
        });
      },

      leaveState: function() {
        clearTimeout(this._startTimerId);
      },

      startRequestFailed: function() {
        this.gotoState('errorStarting');
      },

      stop: function() {
        this.gotoState('canceling');
      },

      collectionStarted: function() {
        this.gotoState('started');
      }
    },

    errorStarting: {
      enterState: function() {
        message = i18n.t("sensor.messages.error_starting_data_collection");
        isStopped = true;

        notifier.alert(i18n.t("sensor.messages.error_starting_data_collection_alert"), {
          OK: function() {
            $(this).dialog("close");
            handle('dismissErrorStarting');
          }
        });
      },

      collectionStarted: function() {
        this.gotoState('started');
      },

      dismissErrorStarting: function() {
        this.gotoState('connected');
      }
    },

    started: {
      enterState: function() {
        if (canControl) {
          message = i18n.t("sensor.messages.collecting_data");
        } else {
          message = i18n.t("sensor.messages.collecting_data_stop_labquest2");
        }
        isStopped = false;
        setColumn();

        // Check, just in case. Specifically, when errorStopping transitions here, collection
        // might have stopped in the meantime.
        if (!labquest2Interface.isCollecting) {
          this.gotoState('stopped');
        }

        if (!dataColumn) {
          this.gotoState('startedWithNoDataColumn');
        }
      },

      data: handleData,

      controlEnabled: function() {
        message = i18n.t("sensor.messages.collecting_data");
      },

      controlDisabled: function() {
        message = i18n.t("sensor.messages.collecting_data_stop_labquest2");
      },

      stop: function() {
        labquest2Interface.requestStop().catch(function() {
          handle('stopRequestFailed');
        });
        this.gotoState('stopping');
      },

      collectionStopped: function() {
        this.gotoState('collectionStopped');
      }
    },

    // This can happen.
    startedWithNoDataColumn: {
      enterState: function() {
        message = i18n.t("sensor.messages.no_data");

        labquest2Interface.requestStop();
        notifier.alert(i18n.t("sensor.messages.no_data_labquest2_alert"), {
          OK: function() {
            $(this).dialog("close");
          }
        });
      },

      collectionStopped: function() {
        this.gotoState('stoppedWithNoDataColumn');
      }
    },

    stoppedWithNoDataColumn: {
      enterState: function() {
        if (isAllDataReceived()) {
          this.gotoState('connected');
        }
      },

      data: function() {
        if (isAllDataReceived()) {
          this.gotoState('connected');
        }
      }
    },

    canceling: {
      enterState: function() {
        message = i18n.t("sensor.messages.canceling_data_collection");
        isStopped = true;
      },

      data: handleData,

      cancelRequestFailed: function() {
        this.gotoState('errorCanceling');
      },

      collectionStarted: function() {
        labquest2Interface.requestStop().catch(function() {
          handle('cancelRequestFailed');
        });
      },

      collectionStopped: function() {
        this.gotoState('collectionStopped');
      }
    },

    errorCanceling: {
      enterState: function() {
        message = i18n.t("sensor.messages.error_canceling_data_collection");
        notifier.alert(i18n.t("sensor.messages.error_canceling_data_collection_alert"), {
          OK: function() {
            $(this).dialog("close");
            handle('dismissErrorStopping');
          }
        });
      },

      data: handleData,

      collectionStopped: function() {
        this.gotoState('collectionStopped');
      },

      dismissErrorStopping: function() {
        this.gotoState('started');
      }
    },

    stopping: {
      enterState: function() {
        message = i18n.t("sensor.messages.stopping_data_collection");
      },

      data: handleData,

      stopRequestFailed: function() {
        this.gotoState('errorStopping');
      },

      collectionStopped: function() {
        this.gotoState('collectionStopped');
      }
    },

    errorStopping: {
      enterState: function() {
        message = i18n.t("sensor.messages.error_stopping_data_collection");
        notifier.alert(i18n.t("sensor.messages.error_stopping_data_collection_alert"), {
          OK: function() {
            $(this).dialog("close");
            handle('dismissErrorStopping');
          }
        });
      },

      data: handleData,

      collectionStopped: function() {
        this.gotoState('collectionStopped');
      },

      dismissErrorStopping: function() {
        this.gotoState('started');
      }
    },

    // The device reports the stop of data collection before all data can be received.
    collectionStopped: {
      enterState: function() {
        message = i18n.t("sensor.messages.data_collection_stopped");
        if (isAllDataReceived()) {
          this.gotoState('collectionComplete');
        }
      },

      data: function() {
        handleData();
        if (isAllDataReceived()) {
          this.gotoState('collectionComplete');
        }
      }
    },

    collectionComplete: {
      enterState: function() {
        message = i18n.t("sensor.messages.data_collection_complete");
        isStopped = true;
      },

      reset: function() {
        initializeStateVariables();
        setSensorReadingDescription();
        this.gotoState('connecting');
        dispatch.reset();
      }
    },

    disconnected: {
      enterState: function() {
        message = i18n.t("sensor.messages.disconnected");
        canConnect = true;
        labquest2Interface.stopPolling();
      },

      leaveState: function() {
        canConnect = false;
      },

      connect: function(address) {
        labquest2Interface.startPolling(address);
        this.gotoState('connecting');
      }
    }
  });

  // Automatically wrap all event handlers invocations with makeInvalidatingChange so that
  // outputs update from closure variable state automatically.
  function handle(eventName) {
    var args = Array.prototype.slice.call(arguments, 0);

    model.makeInvalidatingChange(function() {
      var handled = stateMachine.handleEvent.apply(stateMachine, args);

      if (!handled) {
        // special handling of any events not handled by the current state:
        if (eventName === 'connectionTimedOut' ||
          eventName === 'sessionChanged') {
          stateMachine.gotoState('disconnected');
        }
      }
    });
  }

  // At least for now, dispatch every interface event to the state machine.
  labquest2Interface.on('*', function() {
    var args = Array.prototype.slice.call(arguments, 0);
    handle.apply(null, [this.event].concat(args));
  });

  // Also, handle "live values" every time they are received.
  labquest2Interface.on('statusReceived', function() {
    if (dataColumn) {
      model.makeInvalidatingChange(function() {
        // Figure out if we're in "live" mode, or if we're still viewing old data
        // (and therefore the live values aren't actually updating)
        var now = new Date();
        if ((dataColumn.liveValueTimeStamp - lastLiveValueTimestamp) > 0) {
          liveMode = true;
          lastLiveValueTimestamp = dataColumn.liveValueTimeStamp;
          liveValueLastChanged = now;
        } else {
          if ((now - liveValueLastChanged) < 2000) {
            liveMode = true;
          } else {
            liveMode = false;
          }
        }
        liveSensorValue = dataColumn.liveValue;
      });
    }
  });

  labquest2Interface.on('controlEnabled', function() {
    canControl = true;
  });

  labquest2Interface.on('controlDisabled', function() {
    canControl = false;
  });

  labModelerMixin = new LabModelerMixin({
    metadata: metadata,
    setters: {},
    unitsDefinition: unitsDefinition,
    initialProperties: initialProperties,
    usePlaybackSupport: false
  });

  labModelerMixin.mixInto(model);
  propertySupport = labModelerMixin.propertySupport;
  dispatch = labModelerMixin.dispatchSupport;
  dispatch.addEventTypes("tick", "play", "stop", "tickStart", "tickEnd");

  initializeStateVariables();

  model.defineOutput('time', {
    label: i18n.t("sensor.measurements.time"),
    unitType: 'time',
    format: '.2f'
  }, function() {
    return time;
  });

  model.defineOutput('displayTime', {
    label: i18n.t("sensor.measurements.time"),
    unitType: 'time',
    format: '.2f'
  }, function() {
    return time;
  });

  model.defineOutput('sensorReading', defaultSensorReadingDescription, function() {
    if (rawSensorValue == null) {
      return rawSensorValue;
    }
    return rawSensorValue - model.properties.tareValue;
  });

  // Because sensorReading updates are batched and delivered much later than the live sensor value
  // from the sensor status response, we define a separate liveSensorReading output that can be
  // updated every time the status is polled.
  model.defineOutput('liveSensorReading', defaultSensorReadingDescription, function() {
    if (liveSensorValue == null) {
      return liveSensorValue;
    }
    return liveSensorValue - model.properties.tareValue;
  });

  model.defineOutput('sensorName', {
    label: "Sensor Name"
  }, function() {
    return sensorName;
  });

  model.defineOutput('isStopped', {
    label: "Stopped?"
  }, function() {
    return isStopped;
  });

  // TODO. We need a way to make "model-writable" read only properties.
  model.defineOutput('isPlayable', {
    label: "Startable?"
  }, function() {
    return isPlayable;
  });

  model.defineOutput('hasPlayed', {
    label: "Has successfully collected data?"
  }, function() {
    return stepCounter > 0;
  });

  model.defineOutput('canTare', {
    label: "Can set a tare value?"
  }, function() {
    return canTare && isSensorTareable;
  });

  model.defineOutput('canConnect', {
    label: "Can begin connecting to the LabQuest2?"
  }, function() {
    return canConnect;
  });

  model.defineOutput('canControl', {
    label: "Can remotely start/stop the LabQuest2?"
  }, function() {
    return canControl;
  });

  model.defineOutput('hasMultipleSensors', {
    label: "Are multiple sensors connected to the LabQuest2?"
  }, function() {
    return hasMultipleSensors;
  });

  model.defineOutput('needsReload', {
    label: "Needs Reload?"
  }, function() {
    return needsReload;
  });

  model.defineOutput('message', {
    label: "User Message"
  }, function() {
    return message;
  });

  // Clean up state before we go
  // TODO
  model.on('willReset.model', function() {
    labquest2Interface.stopPolling();
    labquest2Interface.requestStop();
  });

  model.updateAllOutputProperties();
  stateMachine.gotoState('notConnected');

  return model;
};
