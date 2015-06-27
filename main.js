var Slm = require('slm');
var fs = require('fs');
var template = Slm.template;

var templateDir = 'reveal.js/templates'
var templateFile = 'block_paragraph.html.slm'

var src = fs.readFileSync(templateDir + '/' + templateFile, {encoding: 'utf8'});

console.log("src", src);
var options = {};
var context = {
  id: '123',
  content: 'Hello world'
};
var result = template.render(src, context, options);

console.log(result);
