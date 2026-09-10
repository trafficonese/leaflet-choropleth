var L = require("leaflet");
var chroma = require("chroma-js");
var _ = {
  defaults: require("lodash/defaults"),
  extend: require("lodash/extend"),
};

function getValue(feature, valueProperty) {
  return typeof valueProperty === "function"
    ? valueProperty(feature)
    : feature.properties[valueProperty];
}

function getFillOpacity(feature, fillOpacityProperty) {
  if (fillOpacityProperty == null) {
    return undefined;
  }
  if (typeof fillOpacityProperty === "number") {
    return fillOpacityProperty;
  }
  return getValue(feature, fillOpacityProperty);
}

function styleFunction(self) {
  return function styleFeature(feature) {
    var style = {};
    var featureValue = getValue(feature, self._options.valueProperty);

    if (!isNaN(featureValue)) {
      for (var i = 1; i < self._limits.length; i++) {
        var upperLimit =
          i === self._limits.length - 1 ? self._limits[i] + 1 : self._limits[i];
        if (featureValue < upperLimit) {
          style.fillColor = self._colors[i - 1];
          break;
        }
      }
    }

    if (self._options.fillOpacityProperty != null) {
      var fillOpacity = getFillOpacity(
        feature,
        self._options.fillOpacityProperty,
      );
      if (fillOpacity != null && !isNaN(Number(fillOpacity))) {
        style.fillOpacity = Number(fillOpacity);
      }
    }

    switch (typeof self._userStyle) {
      case "function":
        return _.extend({}, self._userStyle(feature), style);
      case "object":
        return _.extend({}, self._userStyle, style);
      default:
        return style;
    }
  };
}

L.GeoJSONChoropleth = L.GeoJSON.extend({
  initialize: function (geojson, options, legendOptions) {
    var self = this;

    options = options || {};

    _.defaults(options, {
      valueProperty: "value",
      scale: ["white", "red"],
      steps: 5,
      mode: "q",
      channelMode: "rgb",
      padding: false,
      correctLightness: false,
      bezierInterpolate: false,
    });

    self._options = options;
    self._userStyle = options.style;

    var cols = options.colors;
    if (!cols) {
      if (options.bezierInterpolate) {
        cols = chroma.bezier(options.scale).scale();
      } else {
        cols = chroma.scale(options.scale);
        cols =
          options.channelMode !== "rgb" ? cols.mode(options.channelMode) : cols;
        cols = options.correctLightness ? cols.correctLightness() : cols;
      }
      var steps = options.steps;
      if (Array.isArray(steps)) {
        steps = steps.length;
      }
      cols = options.padding
        ? cols.padding(options.padding).colors(steps)
        : cols.colors(steps);
    }
    self._colors = cols;
    self._limits = null;

    if (!$.isEmptyObject(legendOptions)) {
      var formatOptions = {},
        legendTitle = null,
        highlightStyle = null,
        resetStyle = null;
      if (legendOptions.formatOptions) {
        formatOptions = legendOptions.formatOptions;
        delete legendOptions.formatOptions;
      }
      if (legendOptions.title) {
        legendTitle = legendOptions.title;
        delete legendOptions.title;
      }
      if (legendOptions.highlightStyle) {
        highlightStyle = legendOptions.highlightStyle;
        delete legendOptions.highlightStyle;
      }
      if (legendOptions.resetStyle) {
        resetStyle = legendOptions.resetStyle;
        delete legendOptions.resetStyle;
      }

      _.defaults(formatOptions, {
        locale: "en-US",
        options: {
          style: "decimal",
          maximumFractionDigits: 2,
        },
      });

      self._legend = L.control(legendOptions);
      self._legend.formatOptions = formatOptions;
      self._legend.title = legendTitle;
      self._legend.highlightStyle = highlightStyle;
      self._legend.resetStyle = resetStyle;
    }

    L.GeoJSON.prototype.initialize.call(
      self,
      null,
      _.extend(self._options, { style: styleFunction(this) }),
    );

    if (geojson) {
      self.setGeoJSON(geojson);
    }
  },
  onAdd: function (map) {
    var self = this;
    L.LayerGroup.prototype.onAdd.call(self, map);
    if (self._legend) {
      if (self._legend.onAdd) {
        self._legend.addTo(map);
      } else {
        self._legend._map = map;
      }
    }
  },
  onRemove: function (map) {
    var self = this;
    if (self._legend) {
      self._legend.remove(map);
    }
    L.LayerGroup.prototype.onRemove.call(self, map);
  },
  setGeoJSON: function (geojson) {
    var self = this;
    var features = L.Util.isArray(geojson) ? geojson : geojson.features;

    var values = features.map(function (feature) {
      return getValue(feature, self._options.valueProperty);
    });

    if (Array.isArray(self._options.steps)) {
      self._limits = self._options.steps;
    } else {
      self._limits = chroma.limits(
        values,
        self._options.mode,
        self._options.steps,
      );
    }
    L.GeoJSON.prototype.addData.call(self, geojson);

    if (self._legend) {
      var legendTitle = self._legend.title,
        locale = self._legend.formatOptions.locale,
        localeOptions = self._legend.formatOptions.options,
        highlightStyle = self._legend.highlightStyle,
        resetStyle = self._legend.resetStyle;

      self._legend.onAdd = function () {
        var div = L.DomUtil.create("div", "info legend");
        if (legendTitle) {
          var title = document.createElement("div");
          title.style = {};
          title.style["font-weight"] = "bold";
          title.appendChild(document.createTextNode(legendTitle));
          div.appendChild(title);
        }
        for (var i = 0; i < self._limits.length - 1; i++) {
          var from, to, legendItemDiv, color, text;
          from = self._limits[i];
          to =
            i === self._limits.length - 2
              ? self._limits[i + 1] + 1
              : self._limits[i + 1];

          legendItemDiv = document.createElement("span");
          legendItemDiv.classList.add("legendItem");
          legendItemDiv.id = L.stamp(legendItemDiv);
          legendItemDiv.dataset.from = from;
          legendItemDiv.dataset.to = to;

          color = document.createElement("i");
          color.style.background = self._colors[i];
          color.style.border = "solid 0.5px #666";

          var textSpan = document.createElement("span");
          text = document.createTextNode(
            from.toLocaleString(locale, localeOptions) +
              " - " +
              to.toLocaleString(locale, localeOptions),
          );
          textSpan.appendChild(text);

          legendItemDiv.appendChild(color);
          legendItemDiv.appendChild(textSpan);
          div.appendChild(legendItemDiv);
          div.appendChild(document.createElement("br"));

          if (!$.isEmptyObject(highlightStyle)) {
            self.eachLayer(function (layer) {
              var featureValue = getValue(
                layer.feature,
                self._options.valueProperty,
              );
              if (featureValue >= from && featureValue < to) {
                layer._legendItemId = legendItemDiv.id;
                if (!layer._highlightLegendItem) {
                  layer._highlightLegendItem = true;
                  layer.on({
                    mouseover: function (e) {
                      document.getElementById(e.target._legendItemId).style[
                        "font-weight"
                      ] = "bold";
                    },
                    mouseout: function (e) {
                      document.getElementById(e.target._legendItemId).style[
                        "font-weight"
                      ] = "normal";
                    },
                  });
                }
              }
            });
            legendItemDiv.addEventListener("mouseover", function (event) {
              var item = event.currentTarget;
              item.style["font-weight"] = "bold";
              self.eachLayer(function (layer) {
                if (item.id === layer._legendItemId) {
                  layer.setStyle(highlightStyle);
                  if (highlightStyle.bringToFront) {
                    layer.bringToFront();
                  }
                }
              });
            });
            legendItemDiv.addEventListener("mouseout", function (event) {
              var item = event.currentTarget;
              item.style["font-weight"] = "normal";
              self.eachLayer(function (layer) {
                if (item.id === layer._legendItemId) {
                  if (!$.isEmptyObject(resetStyle)) {
                    var restored = _.extend({}, resetStyle);
                    var fillOpacity = getFillOpacity(
                      layer.feature,
                      self._options.fillOpacityProperty,
                    );
                    if (fillOpacity != null && !isNaN(Number(fillOpacity))) {
                      restored.fillOpacity = Number(fillOpacity);
                    }
                    layer.setStyle(restored);
                  } else {
                    self.resetStyle(layer);
                  }
                  if (highlightStyle.sendToBack) {
                    layer.bringToBack();
                  }
                }
              });
            });
          }
        }
        return div;
      };
      if (self._legend._map) {
        self._legend.addTo(self._legend._map);
      }
    }
  },
});

L.choropleth = module.exports = function (geojson, options, legendOptions) {
  return new L.GeoJSONChoropleth(geojson, options, legendOptions);
};
