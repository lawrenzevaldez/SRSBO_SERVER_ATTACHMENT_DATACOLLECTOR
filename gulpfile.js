const gulp = require('gulp')
const nodemon = require('gulp-nodemon')
 
 function start() {
   return nodemon({
     script: 'server.js',
     watch:['start/*.*', 'database/*.*' , 'config/*.*', 'app/**'],
     env: {'NODE_ENV': 'local'},
   })
 }

 let build = gulp.series(start)

 exports.build   = build
 exports.default = build