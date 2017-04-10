var gulp = require('gulp');
var useref = require('gulp-useref');
var clean = require('gulp-clean');
var connect = require('connect');
var http = require('http');
var serveStatic = require('serve-static');
var proxy = require('http-proxy-middleware');

gulp.task('serve', function () {
  var app = connect();
  app.use(proxy('/api', {
    target: 'http://localhost:3001',
    changeOrigin: true,
    ws: true
  }));
  app.use('/node_modules', serveStatic('./node_modules'));
  app.use('/lib', serveStatic('./lib'));
  app.use('/', serveStatic('./app'));
  http.createServer(app).listen(3000);
  console.log('Listening on: ' + 3000);
});

gulp.task('clean', function () {
  return gulp.src('./dist', {read: false})
             .pipe(clean())
});

gulp.task('build-sources', ['clean'], function () {
  return gulp.src('app/index.html')
             .pipe(useref())
             .pipe(gulp.dest('dist'));
});

gulp.task('build', ['build-sources'], function () {
  return gulp.src('./dist/index.html', {read: false})
             .pipe(clean());
});
