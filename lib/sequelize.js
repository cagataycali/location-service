const Sequelize = require('sequelize');
const colors = require('colors');
const locationDetails = require('./locationDetails');

let sequelize;
if (process.env.NODE_ENV === "production") {
  sequelize = new Sequelize(process.env.CLEARDB_DATABASE_URL, {});
} else {
  sequelize = new Sequelize('location-service', 'root', 'root', {
      "host": "localhost",
      "dialect": "mysql",
      "logging": false,
      "charset": "utf8",
      "collate": "utf8_general_ci",
      "dialectOptions": {
        "charset": "utf8mb4"
      }
    });
}

sequelize
  .authenticate()
  .then(function(err) {
    console.log(colors.green('Connection has been established successfully.'));
  }, function (err) {
    console.log(colors.red('Unable to connect to the database:'), err);
  });

const User = sequelize.define('user', {
  username: Sequelize.STRING,
  occupation: Sequelize.STRING,
  opinion: Sequelize.STRING,
  email: Sequelize.STRING,
  name: Sequelize.STRING,
  key: {
    type: Sequelize.STRING,
    field: 'key',
    unique: true,
  }
});

const Location = sequelize.define('location', {
  geometry: {
      type: Sequelize.GEOMETRY('POINT'),
      allowNull: false
  },
  administrative_area_level_1: Sequelize.STRING,
  administrative_area_level_2: Sequelize.STRING,
  administrative_area_level_3: Sequelize.STRING,
  administrative_area_level_4: Sequelize.STRING,
  postal_code: Sequelize.STRING,
  street_address: Sequelize.STRING,
  country: Sequelize.STRING,
  locality: Sequelize.STRING,
  key: {
    type: Sequelize.STRING,
    field: 'key',
    unique: true,
    allowNull: false
  }
});

User.hasMany(Location, {foreignKey: 'userId', sourceKey: 'key'});
Location.belongsTo(User, {foreignKey: 'userId', targetKey: 'key'});

sequelize
  .sync()
  .then(function(err) {
    console.log(colors.green('Database synced successfully.'));
  }, function (err) {
    console.log(colors.red('An error occurred while creating the table:'), err);
  });

const addLocation = (obj) => {
  return new Promise(async(resolve, reject) => {
    if (!obj.token) {
      reject('Token need!');
    } else if (!obj.key) {
      reject('Location key need!\nLocation key for you dude, you can knew which data is real only that way.');
    }
    try {
      let user = await User.findOrCreate({ where: { key: obj.token } });
      let details = await locationDetails({ lat: obj.lat, lon: obj.lon });
      details.key = obj.key;
      if (!details.country || !details.locality || !details.administrative_area_level_1 || !details.administrative_area_level_2) {
        reject('Details doesn\'t fetched.')
      } else {
        await Location.upsert(details)
        let location = await Location.findOne({ where: {key: details.key} })
        location.setUser(user[0]);
        resolve(details)
      }
    } catch (e) {
      console.log('Error addLocation', e);
      reject(e);
    } finally {
      console.log('addLocation worked.');
    }
  });
}

const deleteLocation = (obj) => {
  return new Promise(async (resolve, reject) => {
    try {
      let user = await User.findOne({ where: { key: obj.token } });
      Location.destroy({ where: { key: obj.key, userId: user.key } });
      resolve(true)
    } catch (e) {
      reject(e)
    } finally {
      console.log('deleteLocation worked.');
    }
  });
}

const deleteUser = (obj) => {
  return new Promise(async (resolve, reject) => {
    try {
      User.destroy({ where: { name: obj.name, key: obj.key } });
      resolve(true)
    } catch (e) {
      reject(e)
    } finally {
      console.log('deleteUser worked.');
    }
  });
}

const createUser = (obj) => {
  return new Promise(async(resolve, reject) => {
    try {
      let user = await User.upsert({ key: obj.key, name: obj.name, username: obj.details.name, occupation: obj.details.occupation, opinion: obj.details.opinion, email: obj.details.email })
      resolve(user);
    } catch (e) {
      console.log('createUser error:', e);
      reject(e)
    } finally {
      console.log('createUser worked.');
    }
  });
}

const nearby = (obj) => {
  return new Promise(async(resolve, reject) => {
    let details = await locationDetails({lat:obj.lat, lon:obj.lon}); // Get location details.
    let depth = ['country', 'locality', 'administrative_area_level_1', 'administrative_area_level_2', 'administrative_area_level_3'];
    let query = `
    SELECT
      id,
      X(geometry) AS "latitude",
      Y(geometry) AS "longitude",
      (
        GLength(
          LineStringFromWKB(
            LineString(
              geometry,
              GeomFromText('POINT(:lat :lon)')
            )
          )
        )
      )
      AS distance,
      locations.key AS token
    FROM locations
      WHERE country=:country
      ${['locality', 'administrative_area_level_1', 'administrative_area_level_2'].slice(0, obj.depth || 1).map(piece => `AND ${piece}=:${piece}`).join('\n')}
      AND userId=:userId
      ORDER BY distance ASC
      LIMIT :limit;`
    let locations = await sequelize.query(query, { model: Location, replacements: { lat: obj.lat, lon:obj.lon, administrative_area_level_1:details.administrative_area_level_1, administrative_area_level_2:details.administrative_area_level_2, country:details.country, locality:details.locality, userId:obj.token, limit:obj.limit }, type: sequelize.QueryTypes.SELECT })
    resolve(locations);
  });
}

module.exports = { sequelize, Sequelize, addLocation, deleteLocation, createUser, deleteUser, nearby }
