
import ModelController from 'common/controllers/model-controller';
import Model from 'models/dual-sensor/modeler';
import ModelContainer from 'models/dual-sensor/view';
import ScriptingAPI from 'models/dual-sensor/scripting-api';
// Dependencies.

export default function(modelUrl, modelOptions, interactiveController) {
  var controller = new ModelController(modelUrl, modelOptions, interactiveController,
    Model, ModelContainer, ScriptingAPI);

  // Note to self: modelController doesn't emit modelLoaded when the model first loads.
  // This was unexpected...

  function setupModelObservers() {
    var model = controller.model;

    model.addObserver('isSensorInitializing', function() {
      var view = controller.modelContainer;

      if (model.properties.isSensorInitializing) {
        view.showInitializationProgress();
      } else {
        view.hideInitializationProgress();
      }
    });

    model.addObserver('sensorReading', function() {
      // if the model is running, the tick handler will take care of it
      if (model.isStopped()) {
        controller.updateView();
      }
    });

    model.addObserver('sensorReading2', function() {
      // if the model is running, the tick handler will take care of it
      if (model.isStopped()) {
        controller.updateView();
      }
    });

    model.addObserver('needsReload', function() {
      if (model.properties.needsReload) {
        interactiveController.reloadModel();
      }
    });

    // TODO This will have to handle have 2 different units...
    model.addPropertyDescriptionObserver('sensorReading', function() {
      var description = model.getPropertyDescription('sensorReading');
      var view = controller.modelContainer;

      view.updateUnits(description.getUnitAbbreviation());
    });

    model.addPropertyDescriptionObserver('sensorReading2', function() {
      var description = model.getPropertyDescription('sensorReading2');
      var view = controller.modelContainer;

      view.updateUnits2(description.getUnitAbbreviation());
    });
  }

  interactiveController.on('modelLoaded.dual-sensor-model-controller', setupModelObservers);

  interactiveController.on('modelReset.dual-sensor-model-controller', function() {
    controller.model.set('isNewRunInProgress', false);
  });

  interactiveController.on('willResetModel', function() {
    controller.model.set('isNewRunInProgress', true);
  });

  return controller;
};
