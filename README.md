
# express-rocket-app
A quick exploration into the [Rocket](http://rocket.github.io) server-client messaging technique in [Express](http://expressjs.com).

**NOTE** This application only works when compression is disabled. A change to the `writeHead` behavior, way back in Connect rev [d5e518ba](https://github.com/senchalabs/connect/commit/d5e518ba6c6f66ba4390d0553c8d97d29a33fb83) (v2.10.1) leaves the app unable to respond correctly to a client subscription request.
