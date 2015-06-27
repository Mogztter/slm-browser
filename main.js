var Slm = require('slm');
var template = Slm.template;

var src = [
      'html',
      '  head',
      '    title Simple Test Title',
      '  body ',
      '    p Hello World, meet Slim.'
    ];

src = src.join('\n');
var options = {};
var context = {};
var result = template.render(src, context, options);

console.log(result);
