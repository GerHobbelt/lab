
import ModelController from 'common/controllers/model-controller';
import Model from './modeler';
import ModelContainer from './view';
import ScriptingAPI from './scripting-api';
// Dependencies.

export default function(modelUrl, modelOptions, interactiveController) {
  var controller = new ModelController(modelUrl, modelOptions, interactiveController,
    Model, ModelContainer, ScriptingAPI);

  // Note to self: modelController doesn't emit modelLoaded when the model first loads.
  // This was unexpected...

  function setupModelObservers() {
    var model = controller.model;

    model.addObserver('liveSensorReading', function() {
      controller.updateView();
    });

    model.addObserver('needsReload', function() {
      if (model.properties.needsReload) {
        interactiveController.reloadModel();
      }
    });

    model.addPropertyDescriptionObserver('sensorReading', function() {
      var description = model.getPropertyDescription('sensorReading');
      var view = controller.modelContainer;

      view.updateUnits(description.getUnitAbbreviation());
    });
  }

  interactiveController.on('modelLoaded.labquest2-model-controller', setupModelObservers);

  interactiveController.on('modelReset.labquest2-model-controller', function() {
    controller.model.set('isNewRunInProgress', false);
  });

  interactiveController.on('willResetModel', function() {
    controller.model.set('isNewRunInProgress', true);
    controller.model.willReset();
  });

  return controller;
};
