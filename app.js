/*jshint node:true, strict:true */
'use strict';

//  Quick exploration into a Rocket implementation for Express
//    http://rocket.github.io
//    http://expressjs.com

var express = require('express');
var morgan = require('morgan');
// var compression = require('compression');
var responseTime = require('response-time');
var bodyParser = require('body-parser');
var errorhandler = require('errorhandler');

var path = require('path');

// DATA
var dataStore = (function () {
  var data = [
    {id: 0, name: 'Armand'},
    {id: 1, name: 'Barack'},
    {id: 2, name: 'Colin'},
  ];
  var nextID = data.length;

  function indexForObject(id) {
    id = parseInt(id);
    var idx = -1;
    for (var i = 0; i < data.length; i++) {
      if (data[i].id !== id) {
        continue;
      }
      idx = i;
      break;
    }
    return idx;
  }

  return {
    data: function () {
      return data;
    },
    get: function (id) {
      var doc = null;
      var idx = indexForObject(id);
      if (idx !== -1) {
        doc = data[idx];
      }
      return doc;
    },
    add: function (name) {
      var doc = {'id': nextID++, 'name': name};
      data.push(doc);
      return doc;
    },
    update: function (id, name) {
      var doc = null;
      var idx = indexForObject(id);
      if (idx !== -1) {
        data[idx].name = name;
        doc = data[idx];
      }
      return doc;
    },
    delete: function (id) {
      var doc = null;
      var idx = indexForObject(id);
      if (idx !== -1) {
        doc = data[idx];
        data.splice(idx, 1);
      }
      return doc;
    }
  };
})();

var connections = [];

// CONFIGURATION
var app = express();
app.set('port', process.env.PORT || 3333);
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
// app.use(compression());
app.use(responseTime());
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
if (app.settings.env === 'development') {
  app.use(errorhandler());
}

// UTILITIES
function constructMessage(operation, path, value) {
  var data = {
    op: operation,
    path: path
  };
  if (value) {
    data.value = value;
  }

  var msg =  '';
  msg += 'event: ' + 'patch' + '\n';
  // msg += 'id: ' + (new Date()).toLocaleTimeString() + '\n';
  msg += 'id: ' + (new Date().getTime()) + '\n';
  msg += 'data: ' + JSON.stringify([data]) + '\n';
  // msg += 'retry: ' + 3000 + '\n';
  msg += '\n';

  return msg;
}
function broadcastMessage(msg) {
  connections.forEach(function (res) { res.write(msg); });
}

function subscribe(req, res) {
  req.socket.setTimeout(Infinity);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive"
  });

  // force OPEN with an empty message
  res.write('id: \n\n');

  connections.push(res);
  console.log('join, subscribers: %d', connections.length);

  // NB - if the client provided a Last-Event-ID, catch them up (much easier to just GET)
  if (req.headers['Last-Event-ID']) {
    console.log('Last-Event-ID: %s', req.headers['Last-Event-ID']);
  }

  req.on('close', function () {
    unsubscribe(res);
  });
}
function unsubscribe(res) {
  var idx = connections.indexOf(res);
  if (idx !== -1) {
    connections.splice(idx, 1);
    console.log('part, remaining subscribers: %d', connections.length);
  }
}

// MIDDLEWARE
app.param('id', function (req, res, next, id) {
  var doc = dataStore.get(id);
  if (!doc) {
    res.status(404).json({message: 'Requested resource not found'});
    return;
  }

  req.doc = doc;
  next();
});

// ROUTES
app.get('/', function (req, res) {
  res.render('index', {'title': 'Express 🚀 App'});
});

app.get('/resources', function (req, res) {
  // allow subscription via GET in addition to SUBSCRIBE (browsers!)
  if (req.accepts('text/event-stream')) {
    console.log('GET /resources with text/event-stream, subscribing');
    subscribe(req, res);
    return;
  }

  res.set('Cache-Control', 'no-cache');
  res.status(200).json({'resources': dataStore.data()});
});
app.subscribe('/resources', function (req, res) {
  console.log('SUBSCRIBE /resources, subscribing');

  subscribe(req, res);
});
app.post('/resources', function (req, res) {
  var doc = dataStore.add(req.body.name);
  console.log(dataStore.data());
  res.status(201).json(doc); // failure 406

  var msg = constructMessage('add', 'resources/' + doc.id, doc);
  broadcastMessage(msg);
});
app.get('/resources/:id', function (req, res) {
  res.status(200).json(req.doc); // failure 404
});
app.put('/resources/:id', function (req, res) {
  var doc = dataStore.update(req.param('id'), req.body.name);
  console.log(dataStore.data());
  res.status(200).json(doc); // failure 406

  var msg = constructMessage('replace', 'resources/' + req.param('id'), doc);
  broadcastMessage(msg);
});
app.delete('/resources/:id', function (req, res) {
  dataStore.delete(req.param('id'));
  console.log(dataStore.data());
  res.status(204).json(); // failure 406

  var msg = constructMessage('remove', 'resources/' + req.param('id'));
  broadcastMessage(msg);
});

app.listen(app.get('port'), function () {
  console.log("✔ Express server listening on port %d in %s mode", app.get('port'), app.settings.env);
});
