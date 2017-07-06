const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const db = require('./lib/sequelize');
const userify = require('userify');
const uuidv4 = require('uuid/v4');
const bodyParser = require('body-parser');

app.use(express.static('public'));

// allow parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ extended: false }))

// allow parse application/json
app.use(bodyParser.json())


app.get('/', (req, res) => res.sendFile('index.html', { root: __dirname }));

/*
  Create user
*/
app.post('/create', async (req, res) => {
  let name = userify();
  let key = uuidv4();
  console.log(req.body);
  try {
    await db.createUser({ name, key, details:req.body })
    res.json({status: true, name, key, message: 'Your cool account has been registered. Please keep them in safe.'})
  } catch (e) {
    res.json({status: false, message: `Something shitty process in our side. Pwiz open a issue at github :( Error details : ${e}`})
  } finally {
    console.log('Create user endpoint worked.');
  }
})

/*
  Get user nearby
*/
app.post('/nearby', async (req, res) => {
  let data = req.body.map(piece => trim(piece));
  if (!data.token || !data.lat || !data.lon) {
    res.status(403).json({message: 'Nearby endpoint needs user token latitude and longitude.'})
  }

  try {
    let locations = await db.nearby({
      lat:data.lat,
      lon:data.lon,
      token:data.token,
      depth: data.depth || 1, // Default is 1
      limit:data.limit || 20,
    });

    res.status(200).json(locations);
  } catch (e) {
    res.status(404).json({message:e});
  } finally {
    console.log('Nearby query triggered.');
  }
})

/*
  Add location
*/
app.post('/add', async (req, res) => {
  let data = req.body.map(piece => trim(piece));
  if (!data.token || !data.key || !data.lat || !data.lon) {
    res.status(403).json({message: 'Add location endpoint needs user token, location key, latitude and longitude.'})
  }
  try {
    let location = await db.addLocation({ lat: data.lat, lon: data.lon, key: data.key, token: data.token});
    // Socket.publish location :)
    res.status(200).json({status:true});
  } catch (e) {
    res.status(404).json({message:e});
  } finally {
    console.log('Add location endpoint worked.');
  }
})

// Location or user
app.post('/delete/:parameter', async (req, res) => {
  let data = req.body.map(piece => trim(piece));
  if (!data.token) {
    res.status(403).json({message: 'Delete endpoint needs user token'})
  }
  try {
    if (req.param.parameter === 'location') {
      if (!data.key) {
        res.status(403).json({message: 'Delete location endpoint needs key which u gave me :)'})
      }
      await db.deleteLocation({
        key: data.key,
        token: data.token
      })
    } else {
      if (!data.name) {
        res.status(403).json({message: 'Delete user endpoint needs username which I gave you :)'})
      }
      await db.deleteUser({
        key: data.token,
        name: data.name
      })
    }
    res.json({status:true});
  } catch (e) {
    res.status(404).json({message:e});
  } finally {
    console.log('Delete location endpoint worked.');
  }
})

io.on('connection', async (socket) => {
  console.log('User connected', socket.id);
  // TODO @cagatay add error handling
  socket.on('createUser', async (data) => {
    let name = userify();
    let key = socket.id;
    await db.createUser({ name, key, details:{name:name, username: data.name, occupation: 'Developer', opinion: 'Definitely', email: data.email} })
    io.to(socket.id).emit('info:create', {status:true, message:'Created user', key, name})
  })

  socket.on('addLocation', async (data) => {
    try {
      let location = await db.addLocation({ lat: data.lat, lon: data.lon, key: data.key, token: data.token});
      // Socket.publish location :)
      io.to(socket.id).emit('add:location', {status:true, location:{lat:data.lat, lon:data.lon}});

    } catch (e) {
      console.log(e);
      io.to(socket.id).emit('add:location', {status:false, location:{lat:data.lat, lon:data.lon, message:e}});
    }
  });

  socket.on('nearby', async (data) => {
    try {
      let locations = await db.nearby({
        lat:data.lat,
        lon:data.lon,
        token:data.token,
        depth: 1, // Default is 1
        limit:data.limit || 20,
      });
      io.to(socket.id).emit('nearby', {status:true, locations, desired:{lat:data.lat, lon:data.lon}});
    } catch (e) {
      io.to(socket.id).emit('nearby', {status:false, message:e});
    } finally {
      console.log('Nearby socket endpoint worked.');
    }
  });

  // TODO @cagatay add error handling
  socket.on('deleteLocation', async (data) => {
    await db.deleteLocation({
      key: data.key,
      token: data.token
    })
    io.to(socket.id).emit('info:delete:location', {status:true, message:'Deleted location'})
  });

  // TODO @cagatay add error handling
  socket.on('deleteUser', async (data) => {
    await db.deleteUser({
      key: data.token,
      name: data.name
    })
    io.to(socket.id).emit('info:delete:user', {status:true, message:'Deleted user'})
  });

});

http.listen(process.env.PORT || 3000, () => console.log(`* listening on port ${process.env.PORT || 3000}!`));
