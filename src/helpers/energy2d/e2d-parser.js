const cheerio = require("cheerio");
const e2dAPI = require("./e2d-node-api");

// Create properties validator
const {
  metadata
} = e2dAPI;
const {
  validator
} = e2dAPI;

/*
  Parses an .E2D (xml) file and returns an object containing the stringified JSON.

  @return
    json: jsonString of the model
*/
exports.parse = function (xmlString) {

  const $ = cheerio.load(xmlString);
  let json = {};

  const read = function ($node, json, orgName, newName) {
    if ((newName == null)) {
      newName = orgName;
    }
    const $val = $node.find(orgName);
    if ($val.length > 0) {
      let val = $val.text();
      if (!isNaN(Number(val))) {
        val = Number(val);
      } else if (val === "true") {
        val = true;
      } else if (val === "false") {
        val = false;
      }
      return json[newName] = val;
    }
  };

  const readAttr = function ($node, json, orgName, newName) {
    if ((newName == null)) {
      newName = orgName;
    }
    let val = $node.attr(orgName);
    if (val != null) {
      if (!isNaN(Number(val))) {
        val = Number(val);
      } else if ((val === "true") || (val === "false")) {
        val = Boolean(val);
      }
      return json[newName] = val;
    }
  };

  // Main properties
  const $m = $("model");
  read($m, json, "timestep", "timeStep");
  read($m, json, "grid_width");
  read($m, json, "grid_height");
  read($m, json, "model_width");
  read($m, json, "model_height");
  read($m, json, "convective");
  read($m, json, "background_temperature");
  read($m, json, "background_conductivity");
  read($m, json, "background_specific_heat");
  read($m, json, "background_density");
  read($m, json, "background_viscosity");
  read($m, json, "thermal_buoyancy");
  read($m, json, "buoyancy_approximation");
  read($m, json, "sunny");
  read($m, json, "sun_angle");
  read($m, json, "solar_power_density");
  read($m, json, "solar_ray_count");
  read($m, json, "solar_ray_speed");
  read($m, json, "photon_emission_interval");
  (function () {
    let $props;
    const b = (json["boundary"] = {});
    if ($("boundary > flux_at_border").length > 0) {
      b.type = "flux";
      $props = $("boundary > flux_at_border");
    }
    if ($("boundary > temperature_at_border").length > 0) {
      b.type = "temperature";
      $props = $("boundary > temperature_at_border");
    }
    ["upper", "lower", "left", "right"].forEach(v => b[v] = Number($props.attr(v)));
    return undefined;
  })();

  json = validator.validateCompleteness(metadata.mainProperties, json);

  // View options
  const $v = $("view");
  let viewOptions = {};
  read($v, viewOptions, "color_palette_type");
  read($v, viewOptions, "velocity");
  read($v, viewOptions, "minimum_temperature");
  read($v, viewOptions, "maximum_temperature");

  viewOptions = validator.validateCompleteness(metadata.viewOptions, viewOptions);
  json.viewOptions = viewOptions;

  // Parts
  const parts = [];
  $("part").each(function (idx, element) {
    const $p = cheerio(element);
    let p = {};
    (function () {
      let $props;
      if ($p.find("rectangle").length > 0) {
        p.shapeType = "rectangle";
        $props = $p.find("rectangle");
      } else if ($p.find("ellipse").length > 0) {
        p.shapeType = "ellipse";
        $props = $p.find("ellipse");
      } else if ($p.find("ring").length > 0) {
        p.shapeType = "ring";
        $props = $p.find("ring");
      } else if ($p.find("polygon").length > 0) {
        p.shapeType = "polygon";
        $props = $p.find("polygon");
      } else if ($p.find("blob").length > 0) {
        p.shapeType = "blob";
        $props = $p.find("blob");
      }
      if ($props != null) {
        ["x", "y", "width", "height", "a", "b", "inner", "outer", "vertices"].forEach(function (key) {
          readAttr($props, p, key);
        });
      }
    })();
    read($p, p, "thermal_conductivity");
    read($p, p, "specific_heat");
    read($p, p, "density");
    read($p, p, "transmission");
    read($p, p, "reflection");
    read($p, p, "absorption");
    read($p, p, "emissivity");
    read($p, p, "temperature");
    read($p, p, "constant_temperature");
    read($p, p, "power");
    read($p, p, "wind_speed");
    read($p, p, "wind_angle");
    read($p, p, "visible");
    read($p, p, "filled");
    read($p, p, "color");
    read($p, p, "label");
    read($p, p, "draggable");
    read($p, p, "texture");
    // simplify texture definition
    if (p.texture != null) {
      const bg_color = $p.find("texture texture_bg").text();
      if (bg_color) {
        // Replace color property with texture background color.
        p.color = (parseInt(bg_color, 16) + Math.pow(2, 24)).toString(16);
      }
      p.texture = true;
    }

    p = validator.validateCompleteness(metadata.part, p);
    return parts.push(p);
  });

  json.structure = {
    part: parts
  };

  // Sensors
  const sensors = [];
  $("sensor").children().each(function (idx, element) {
    const $p = cheerio(element);
    let p = {};
    if ($p[0].name === "heat_flux_sensor") {
      p.type = "heatFlux";
    } else {
      p.type = $p[0].name;
    }
    readAttr($p, p, "x");
    readAttr($p, p, "y");
    readAttr($p, p, "label");
    readAttr($p, p, "angle");
    if (p.angle) {
      p.angle = ((p.angle * 180) / Math.PI).toFixed(2);
    }
    if (p.type === "thermometer") {
      // Java E2D measures temperature in a different point of the sensor.
      p.y += json.model_height / 50;
    }
    p = validator.validateCompleteness(metadata.sensor, p);
    return sensors.push(p);
  });

  json.sensors = sensors;

  return json;
};
