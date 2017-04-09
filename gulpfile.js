var gulp = require('gulp');
var connect = require('connect');
var http = require('http');
var serveStatic = require('serve-static');
var proxy = require('http-proxy-middleware');

gulp.task('serve', function () {
  var app = connect();
  app.use(proxy('/api', {target: 'http://localhost:3001', changeOrigin: true, ws: true}));
  app.use('/node_modules', serveStatic('./node_modules'));
  app.use('/lib', serveStatic('./lib'));
  app.use('/', serveStatic('./app'));
  http.createServer(app).listen(3000);
  console.log('Listening on: ' + 3000);
});
