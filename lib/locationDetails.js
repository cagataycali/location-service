var request = require('request');

module.exports = (data) => {
  return new Promise((resolve, reject) => {
    var url = `http://maps.googleapis.com/maps/api/geocode/json?latlng=${data.lat},${data.lon}&sensor=true`;

    var locationObj = {};
    locationObj.lat = data.lat;
    locationObj.lon = data.lon;
    locationObj.geometry = { type: 'Point', coordinates: [data.lat, data.lon]};

    request(url, (error, response, body) => {
      if (!error && response.statusCode == 200) {
        var out = JSON.parse(body)

        out.results.forEach((location) => {
          if (location.types[0] === location.address_components[0]) {
            eval(`locationObj.${location.types[0]} = location.address_components[0];`)
          } else {
            location.address_components.forEach((adresses) => {
              if (adresses.types[0] == location.types[0] || adresses.types[1] == location.types[0]) {
                if (adresses.long_name) {
                  eval(`locationObj.${location.types[0]} = adresses.long_name;`)
                } else {
                  eval(`locationObj.${location.types[0]} = adresses.short_name;`)
                }
              }
            })
          }
        })
      resolve(locationObj);
      }
    });

  });
}
