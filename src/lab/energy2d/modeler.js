/*global define: false */

define(function (require) {
  'use strict';
  var metadata        = require('energy2d/metadata'),
      coremodel       = require('energy2d/models/core-model'),
      LabModelerMixin = require('common/lab-modeler-mixin'),

      unitsDefinition = {
        units: {
          time: {
            name: "second",
            pluralName: "seconds",
            symbol: "s"
          }
        }
      };

  return function Modeler(initialProperties) {
    var model,
        coreModel,

        labModelerMixin = new LabModelerMixin({
          metadata: metadata,
          unitsDefinition: unitsDefinition,
          initialProperties: initialProperties,
          setters: {
            use_WebGL: function (v) {
              if (coreModel) coreModel.useWebGL = v;
            }
          }
        }),
        dispatch = labModelerMixin.dispatchSupport;

    model = {
      tick: function () {
        var i, len;
        for (i = 0, len = model.properties.timeStepsPerTick; i < len; i++) {
          coreModel.nextStep();
        }
        model.updateAllOutputProperties();
        dispatch.tick();
      },

      getTime: function () {
        return model.properties.timeStep * coreModel.getIndexOfStep();
      },
      isWebGLActive: function () {
        return coreModel.isWebGLActive();
      },
      getWebGLError: function () {
        return coreModel.getWebGLError();
      },
      getIndexOfStep: function () {
        return coreModel.getIndexOfStep();
      },
      getTemperatureArray: function () {
        return coreModel.getTemperatureArray();
      },
      getTemperatureTexture: function () {
        return coreModel.getTemperatureTexture();
      },
      getUVelocityArray: function () {
        return coreModel.getUVelocityArray();
      },
      getVVelocityArray: function () {
        return coreModel.getVVelocityArray();
      },
      getVelocityTexture: function () {
        return coreModel.getVelocityTexture();
      },
      getPhotonsArray: function () {
        return coreModel.getPhotonsArray();
      },
      getPartsArray: function () {
        return coreModel.getPartsArray();
      },
      updateTemperatureArray: function () {
        return coreModel.updateTemperatureArray();
      },
      updateVelocityArrays: function () {
        return coreModel.updateVelocityArrays();
      },
      setPerformanceTools: function () {
        return coreModel.setPerformanceTools();
      }
    };

    (function () {
      labModelerMixin.mixInto(model);
      dispatch.addEventTypes("tick");

      coreModel = coremodel.makeCoreModel(model.properties);

      model.defineOutput('time', {
        label: "Time",
        unitType: 'time',
        format: '.2f'
      }, function() {
        return model.getTime();
      });

      model.defineOutput('displayTime', {
        label: "Time",
        unitType: 'time',
        format: '.2f'
      }, function() {
        return model.getTime();
      });
    }());

    return model;
  };
});
