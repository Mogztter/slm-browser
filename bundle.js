(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Slm = require('slm');
var template = Slm.template;

var src = 'p Hello World, meet Slim.';
var options = {};
var context = {};
var result = template.render(src, context, options);

console.log(result);

$('#content').html(result);

},{"slm":22}],2:[function(require,module,exports){
var methodSplitRE = /_/;
var methodRE = /^on(_\w+)*$/;

function Node() {
  this._nodes = {};
}

Node.prototype.compile = function(level, callMethod) {
  if (this._method) {
    callMethod = 'this.' + this._method + '(exps)';
  }

  var code = 'switch(exps[' + level + ']) {';
  var empty = true;

  for (var key in this._nodes) {
    empty = false;
    code += '\ncase \'' + key + '\' : \n';
    code +=  this._nodes[key].compile(level + 1, callMethod) + ';';
  }

  if (empty) {
    return 'return ' + callMethod;
  }

  code += '\ndefault:\nreturn ' + (callMethod || 'exps') + ';}';

  return code;
};

function Dispatcher() { }

var DispatcherProto = Dispatcher.prototype;

DispatcherProto.exec = function(exp) {
  return this.compile(exp);
};

DispatcherProto.compile = function(exp) {
  return this._dispatcher(exp);
};

DispatcherProto._dispatcher = function(exp) {
  return this._replaceDispatcher(exp);
};

DispatcherProto._dispatchedMethods = function() {
  var res = [];

  for (var key in this) {
    if (methodRE.test(key)) {
      res.push(key);
    }
  }
  return res;
};

DispatcherProto._replaceDispatcher = function(exp) {
  var tree = new Node();
  var dispatchedMethods = this._dispatchedMethods();
  for (var i = 0, il = dispatchedMethods.length; i < il; i++) {
    var method = dispatchedMethods[i], node = tree;
    var types = method.split(methodSplitRE);
    for (var j = 1, jl = types.length; j < jl; j++) {
      var type = types[j];
      var n = node._nodes[type];
      node = node._nodes[type] = n || new Node();
    }
    node._method = method;
  }
  this._dispatcher = new Function('exps', tree.compile(0));
  return this._dispatcher(exp);
};

module.exports = Dispatcher;

},{}],3:[function(require,module,exports){
function Engine() {
  this._chain = [];
}

var p = Engine.prototype;

p.use = function(filter) {
  this._chain.push(filter);
};

p.exec = function(src, options) {
  var res = src;
  for (var i = 0, li = this._chain.length; i < li; i++) {
    res = this._chain[i].exec(res, options);
  }

  return res;
};

module.exports = Engine;

},{}],4:[function(require,module,exports){
var Dispatcher = require('./dispatcher');

function Filter() {}
var p = Filter.prototype = new Dispatcher();

var uniqueName = 0;

// Tools

p._isEmptyExp = function(exp) {
  switch (exp[0]) {
  case 'multi':
    for (var i = 1, l = exp.length; i < l; i++) {
      if (!this._isEmptyExp(exp[i])) {
        return false;
      }
    }
    return true;
  case 'newline':
    return true;
  default:
    return false;
  }
};

p._uniqueName = function() {
  uniqueName++;
  return '$lm' + uniqueName.toString(16);
};

p._compileEach = function(exps, startIndex) {
  for (var i = startIndex, l = exps.length; i < l; i++) {
    exps[i] = this.compile(exps[i]);
  }
  return exps;
};

p._shiftAndCompile = function(exps) {
  return this._compileEach(exps, 2);
};

// Core

p.on_multi = function(exps) {
  return this._compileEach(exps, 1);
};

p.on_capture = function(exps) {
  return ['capture', exps[1], exps[2], this.compile(exps[3])];
};

// Control Flow

p.on_if = p._shiftAndCompile;

p._shiftAndCompileMulti = function(exps) {
  var res = ['multi'];

  for (var i = 2, l = exps.length; i < l; i++) {
    res.push(this.compile(exps[i]));
  }
  return res;
};

p.on_switch = function(exps) {
  for (var i = 2, l = exps.length; i < l; i++) {
    var exp = exps[i];
    exps[i] = [exp[0], this.compile(exp[1])];
  }
  return exps;
};

p.on_block = function(exps) {
  return ['block', exps[1], this.compile(exps[2])];
};

// Escaping

p.on_escape = function(exps) {
  return ['escape', exps[1], this.compile(exps[2])];
};

module.exports = Filter;

},{"./dispatcher":2}],5:[function(require,module,exports){
var Slm = require('./slm');

function AttrMerge(mergeAttrs) {
  this._mergeAttrs = mergeAttrs;
}

var p = AttrMerge.prototype = new Slm();

p.on_html_attrs = function(exps) {
  var names = [], values = {};
  for (var i = 2, l = exps.length; i < l; i++) {
    var attr = exps[i];
    var name = attr[2].toString(), val = attr[3];
    if (values[name]) {
      if (!this._mergeAttrs[name]) {
        throw new Error('Multiple ' + name + ' attributes specified');
      }

      values[name].push(val);
    } else {
      values[name] = [val];
      names.push(name);
    }
  }

  names.sort();

  return this._merge(names, values);
};

p._merge = function(names, values) {
  var attrs = [];
  for (var i = 0, il = names.length; i < il; i++) {
    var name = names[i];
    var value = values[name], delimiter = this._mergeAttrs[name];
    if (delimiter && value.length > 1) {
      var all = false, exp = ['multi'];
      for (var k = 0, kl = value.length; k < kl; k++) {
        var kv = value[k];
        all = this._isContainNonEmptyStatic(kv);
        if (!all) {
          break;
        }
      }
      if (all) {
        for (var j = 0, jl = value.length; j < jl; j++) {
          var jv = value[j];
          if (j) {
            exp.push(['static', delimiter]);
          }
          exp.push(jv);
        }
        attrs[i] = ['html', 'attr', name, exp];
      } else {
        var captures = this._uniqueName();
        exp.push(['code', 'var ' + captures + '=[];']);
        for (var a = 0, al = value.length; a < al; a++) {
          exp.push(['capture', captures + '[' + a + ']', captures + '[' + a + ']' + '=\'\';', value[a]]);
        }
        exp.push(['dynamic', 'vm.rejectEmpty(' + captures + ').join("' + delimiter + '")']);
        attrs[i] = ['html', 'attr', name, exp];
      }
    } else {
      attrs[i] = ['html', 'attr', name, value[0]];
    }
  }

  return ['html', 'attrs'].concat(attrs);
};

module.exports = AttrMerge;

},{"./slm":15}],6:[function(require,module,exports){
var Slm = require('./slm');

function AttrRemove(removeEmptyAttrs) {
  this._removeEmptyAttrs = removeEmptyAttrs;
}

AttrRemove.prototype = new Slm();

AttrRemove.prototype.on_html_attr = function(exps) {
  var name = exps[2], value = exps[3];
  if (this._removeEmptyAttrs[name.toString()] === undefined) {
    return Slm.prototype.on_html_attr.call(this, exps);
  }

  if (this._isContainNonEmptyStatic(value)) {
    return ['html', 'attr', name, value];
  }

  var tmp = this._uniqueName();
  return [
    'multi',
      ['capture', tmp, 'var ' + tmp + '=\'\';', this.compile(value)],
      ['if', tmp + '.length',
        ['html', 'attr', name, ['dynamic', tmp]]
      ]
  ];
};

module.exports = AttrRemove;

},{"./slm":15}],7:[function(require,module,exports){
var Slm = require('./slm');

var blockRe = /^(case|default)\b/;
var wrapCondRe = /^(for|switch|catch|while|if|else\s+if)\s+(?!\()((\S|\s\S)*)\s*$/;
var ifRe = /^(if|switch|while|for|else|finally|catch)\b/;
var callbackRe = /(function\s*\([^\)]*\)\s*)[^\{]/;

function Brackets() {}

var p = Brackets.prototype = new Slm();

p.on_slm_control = function(exps) {
  var code = exps[2], content = exps[3], m;

  m = wrapCondRe.exec(code);
  if (m) {
    code = code.replace(m[2], '(' + m[2] + ')');
  }

  code = this._expandCallback(code, content);
  return ['slm', 'control', code, this.compile(content)];
};

p.on_slm_output = function(exps) {
  var code = exps[3], content = exps[4];
  code = this._expandCallback(code, content);
  return ['slm', 'output', exps[2], code, this.compile(content)];
};

p._expandCallback = function(code, content) {
  var index, m, postCode = '}';
  if (!blockRe.test(code) && !this._isEmptyExp(content)) {
    if (!ifRe.test(code)) {
      m = callbackRe.exec(code);
      if (m) {
        index = m.index + m[1].length;
        postCode += code.slice(index);
        code = code.slice(0, index);
      } else if ((index = code.lastIndexOf(')')) !== -1) {
        var firstIndex = code.indexOf('(');
        if (firstIndex === -1) {
          throw new Error('Missing open brace "(" in `' + code + '`');
        }
        var args = code.slice(firstIndex + 1, index);
        postCode += code.slice(index);
        if (/^\s*$/.test(args)) {
          code = code.slice(0, index) + 'function()';
        } else {
          code = code.slice(0, index) + ',function()';
        }
      }
    }
    code += '{';
    content.push(['code', postCode]);

  }
  return code;
};

module.exports = Brackets;

},{"./slm":15}],8:[function(require,module,exports){
var Slm = require('./slm');

function CodeAttributes(mergeAttrs) {
  //this._attr = null;
  this._mergeAttrs = mergeAttrs;
}

var p = CodeAttributes.prototype = new Slm();

p.on_html_attrs = p._shiftAndCompileMulti;

p.on_html_attr = function(exps) {
  var name = exps[2], value = exps[3];
  if (value[0] === 'slm' && value[1] === 'attrvalue' && !this._mergeAttrs[name]) {
    // We handle the attribute as a boolean attribute
    var escape = value[2], code = value[3];
    switch (code) {
    case 'true':
      return ['html', 'attr', name, ['multi']];
    case 'false':
    case 'null':
    case 'undefined':
      return ['multi'];
    default:
      var tmp = this._uniqueName();
      return ['multi',
       ['code', 'var ' + tmp + '=' + code],
       ['switch', tmp,
        ['true', ['multi',
          ['html', 'attr', name, ['multi']],
          ['code', 'break']]],
        ['false', ['multi']],
        ['undefined', ['multi']],
        ['null', ['code', 'break']],
        ['default', ['html', 'attr', name, ['escape', escape, ['dynamic', tmp]]]]]];
    }
  } else {
    // Attribute with merging
    this._attr = name;
    return Slm.prototype.on_html_attr.call(this, exps);
  }
};

p.on_slm_attrvalue = function(exps) {
  var escape = exps[2], code = exps[3];
  // We perform attribute merging on Array values
  var delimiter = this._mergeAttrs[this._attr];
  if (delimiter) {
    var tmp = this._uniqueName();
    return ['multi',
     ['code', 'var ' + tmp + '=' + code + ';'],
     ['if', tmp + ' instanceof Array',
      ['multi',
        ['code',  tmp + '=vm.rejectEmpty(vm.flatten(' + tmp + '));'],
       ['escape', escape, ['dynamic', tmp + '.join("' + delimiter + '")']]],
      ['escape', escape, ['dynamic', tmp]]]];
  }
  return ['escape', escape, ['dynamic', code]];
};

module.exports = CodeAttributes;

},{"./slm":15}],9:[function(require,module,exports){
var Slm = require('./slm');

function ControlFlow() {}

var p = ControlFlow.prototype = new Slm();

p.on_switch = function(exps) {
  var arg = exps[1], res = ['multi', ['code', 'switch(' + arg + '){']];

  for (var i = 2, l = exps.length; i < l; i++) {
    var exp = exps[i];
    res.push(['code', exp[0] === 'default' ? 'default:' : 'case ' + exp[0] + ':']);
    res.push(this.compile(exp[1]));
  }

  res.push(['code', '}']);
  return res;
};

p.on_if = function(exps) {
  var condition = exps[1], yes = exps[2], no = exps[3];

  var result = ['multi', ['code', 'if(' + condition + '){'], this.compile(yes)];
  if (no) {
    result.push(['code', '}else{']);
    result.push(this.compile(no));
  }
  result.push(['code', '}']);
  return result;
};

p.on_block = function(exps) {
  var code = exps[1], exp = exps[2];
  return ['multi', ['code', code], this.compile(exp)];
};

module.exports = ControlFlow;

},{"./slm":15}],10:[function(require,module,exports){
var Slm = require('./slm');

var ifRe = /^(if)\b|{\s*$/;

function Control() {}

var p = Control.prototype = new Slm();

p.on_slm_control = function(exps) {
  return ['multi', ['code', exps[2]], this.compile(exps[3])];
};

p.on_slm_output = function(exps) {
  var escape = exps[2], code = exps[3], content = exps[4];
  if (ifRe.test(code)) {
    var tmp = this._uniqueName(), tmp2 = this._uniqueName();
    content = this.compile(content);
    content.splice(content.length - 1, 0, ['code', 'return vm.safe(' + tmp2 + ');']);
    return ['multi',
      // Capture the result of the code in a variable. We can't do
      // `[dynamic, code]` because it's probably not a complete
      // expression (which is a requirement for Temple).
      ['block', 'var ' + tmp + '=' + code,

        // Capture the content of a block in a separate buffer. This means
        // that `yield` will not output the content to the current buffer,
        // but rather return the output.
        //
        // The capturing can be disabled with the option :disable_capture.
        // Output code in the block writes directly to the output buffer then.
        // Rails handles this by replacing the output buffer for helpers.
        // options[:disable_capture] ? compile(content) : [:capture, unique_name, compile(content)]],
        ['capture', tmp2, 'var ' + tmp2 + '=\'\';', content]],

       // Output the content.
      ['escape', 'escape', ['dynamic', tmp]]
    ];
  }
  return ['multi', ['escape', escape, ['dynamic', code]], content];
};

p.on_slm_text = function(exps) {
  return this.compile(exps[2]);
};

module.exports = Control;

},{"./slm":15}],11:[function(require,module,exports){
var Slm = require('./slm');

function TextCollector() {}
var TextProto = TextCollector.prototype = new Slm();

TextProto.exec = function(exp) {
  this._collected = '';
  Slm.prototype.exec.call(this, exp);
  return this._collected;
};

TextProto.on_slm_interpolate = function(exps) {
  this._collected += exps[2];
};

function Engine() {
  this._textCollector = new TextCollector();
}
var EngineProto = Engine.prototype = new Slm();

EngineProto.collectText = function(body) {
  return this._textCollector.exec(body);
};

function Javascript(options) {
  this._withType = options && options.typeAttribute;
}
Javascript.prototype = new Engine();

Javascript.prototype.on_slm_embedded = function(exps) {
  var body = exps[3];
  if (this._withType) {
    return ['html', 'tag', 'script',['html', 'attrs',
      ['html', 'attr', 'type', ['static', 'text/javascript']]], body];
  }
  return ['html', 'tag', 'script', ['html', 'attrs'], body];
};

function CSS() {}
CSS.prototype = new Engine();

CSS.prototype.on_slm_embedded = function(exps) {
  var body = exps[3];
  return ['html', 'tag', 'style', ['html', 'attrs',
    ['html', 'attr', 'type', ['static', 'text/css']]], body];
};

function Embedded() {
  this._engines = {};
}

var EmbeddedProto = Embedded.prototype = new Slm();

EmbeddedProto.register = function(name, filter) {
  this._engines[name] = filter;
};

EmbeddedProto.on_slm_embedded = function(exps) {
  var name = exps[2];
  var engine = this._engines[name];
  if (!engine) {
    throw new Error('Embedded engine ' + name + ' is not registered.');
  }
  return this._engines[name].on_slm_embedded(exps);
};

var InterpolateEngine = function(renderer) {
  this.renderer = renderer;
};

var InterpolateProto = InterpolateEngine.prototype = new Engine();

InterpolateProto.on_slm_embedded = function(exps) {
  var body = exps[3];
  var text = this.collectText(body);
  return ['multi', ['slm', 'interpolate', this.renderer(text)]];
};

module.exports = {
  Embedded: Embedded,
  Javascript: Javascript,
  CSS: CSS,
  TextCollector: TextCollector,
  InterpolateEngine: InterpolateEngine
};

},{"./slm":15}],12:[function(require,module,exports){
var Filter = require('../filter');
var VM = require('../vm');

function Escape() {
  this._disableEscape = false;
  this._escape = false;
  this._escaper = VM.escape;
}

var p = Escape.prototype = new Filter();

p._escapeCode = function(v) {
  return 'vm.escape(' + v.replace(/;+$/, '') + ')';
};

p.on_escape = function(exps) {
  var old = this.escape;
  this._escape = exps[1] && !this._disableEscape;
  try {
    return this.compile(exps[2]);
  } finally {
    this._escape = old;
  }
};

p.on_static = function(exps) {
  return ['static', this._escape ? this._escaper(exps[1]) : exps[1]];
};

p.on_dynamic = function(exps) {
  return ['dynamic', this._escape ? this._escapeCode(exps[1]) : exps[1]];
};

module.exports = Escape;

},{"../filter":4,"../vm":24}],13:[function(require,module,exports){
var Slm = require('./slm');

var escapedInterpolationRe = /^\\\$\{/;
var interpolationRe = /^\$\{/;
var staticTextRe = /^([\$\\]?[^\$\\]*([\$\\][^\\\$\{][^\$\\]*)*)/;

function Interpolate() {}

var p = Interpolate.prototype = new Slm();

p.on_slm_interpolate = function(exps) {
  var str = exps[2], m, code;

  // Interpolate variables in text (${variable}).
  // Split the text into multiple dynamic and static parts.
  var block = ['multi'];
  do {
    // Escaped interpolation
    m = escapedInterpolationRe.exec(str);
    if (m) {
      block.push(['static', '${']);
      str = str.slice(m[0].length);
      continue;
    }
    m = interpolationRe.exec(str);
    if (m) {
      // Interpolation
      var res = this._parseExpression(str.slice(m[0].length));
      str = res[0];
      code = res[1];
      var escape = code[0] !== '=';
      block.push(['slm', 'output', escape, escape ? code : code.slice(1), ['multi']]);
    } else {
      m = staticTextRe.exec(str);
      // static text
      block.push(['static', m[0]]);
      str = str.slice(m[0].length);
    }
  } while (str.length);

  return block;
};

p._parseExpression = function(str) {
  for (var count = 1, i = 0, l = str.length; i < l && count; i++) {
    if (str[i] === '{') {
      count++;
    } else if (str[i] === '}') {
      count--;
    }
  }

  if (count) {
    throw new Error('Text interpolation: Expected closing }');
  }

  return [str.slice(i), str.substring(0, i - 1)];
};

module.exports = Interpolate;

},{"./slm":15}],14:[function(require,module,exports){
var Filter = require('../filter');

// Flattens nested multi expressions

function MultiFlattener() {}
MultiFlattener.prototype = new Filter();

MultiFlattener.prototype.on_multi = function(exps) {
  // If the multi contains a single element, just return the element
  var len = exps.length;
  if (len === 2) {
    return this.compile(exps[1]);
  }

  var res = ['multi'];

  for (var i = 1; i < len; i++) {
    var exp = exps[i];
    exp = this.compile(exp);
    if (exp[0] === 'multi') {
      for (var j = 1, l = exp.length; j < l; j++) {
        res.push(exp[j]);
      }
    } else {
      res.push(exp);
    }
  }

  return res;
};

module.exports = MultiFlattener;

},{"../filter":4}],15:[function(require,module,exports){
var Filter = require('../html/html');

function Slm() {}
var p = Slm.prototype = new Filter();

// Pass-through handlers
p.on_slm_text = function(exps) {
  exps[2] = this.compile(exps[2]);
  return exps;
};

//p.on_slm_embedded = function(exps) {
  //exps[3] = this.compile(exps[3]);
  //return exps;
//};

p.on_slm_control = function(exps) {
  exps[3] = this.compile(exps[3]);
  return exps;
};

p.on_slm_output = function(exps) {
  exps[4] = this.compile(exps[4]);
  return exps;
};

module.exports = Slm;

},{"../html/html":20}],16:[function(require,module,exports){
var Filter = require('../filter');

/**
* Merges several statics into a single static.  Example:
*
*   ['multi',
*     ['static', 'Hello '],
*     ['static', 'World!']]
*
* Compiles to:
*
*   ['static', 'Hello World!']
*/

function StaticMerger() {}
StaticMerger.prototype = new Filter();

StaticMerger.prototype.on_multi = function(exps) {
  var res = ['multi'], node;

  for (var i = 1, l = exps.length; i < l; i++) {
    var exp = exps[i];
    if (exp[0] === 'static') {
      if (node) {
        node[1] += exp[1];
      } else {
        node = ['static', exp[1]];
        res.push(node);
      }
    } else {
      res.push(this.compile(exp));
      if (exp[0] !== 'newline') {
        node = null;
      }
    }
  }

  return res.length === 2 ? res[1] : res;
};

module.exports = StaticMerger;

},{"../filter":4}],17:[function(require,module,exports){
var Dispatcher = require('./dispatcher');

function Generator() {
  this._buffer = '_b';
}

var p = Generator.prototype = new Dispatcher();

p.exec = function(exp) {
  return [this.preamble(), this.compile(exp)].join('');
};

p.on = function(exp) {
  throw new Error('Generator supports only core expressions - found ' + JSON.stringify(exp));
};

p.on_multi = function(exps) {
  for (var i = 1, l = exps.length; i < l; i++) {
    exps[i] = this.compile(exps[i]);
  }
  exps.shift();
  return exps.join('\n');
};

p.on_newline = function() {
  return '';
};

p.on_static = function(exps) {
  return this.concat(JSON.stringify(exps[1]));
};

p.on_dynamic = function(exps) {
  return this.concat(exps[1]);
};

p.on_code = function(exps) {
  return exps[1];
};

p.concat = function(str) {
  return this._buffer + '+=' + str + ';';
};

module.exports = Generator;

},{"./dispatcher":2}],18:[function(require,module,exports){
var Generator = require('../generator');

function StringGenerator(name, initializer) {
  this._buffer = name || '_b';
  this._initializer = initializer;
}
var p = StringGenerator.prototype = new Generator();

p.preamble = function() {
  return this._initializer ? this._initializer : 'var ' + this._buffer + '=\'\';';
};

p.on_capture = function(exps) {
  var generator = new StringGenerator(exps[1], exps[2]);
  generator._dispatcher = this._dispatcher;
  return generator.exec(exps[3]);
};

module.exports = StringGenerator;

},{"../generator":17}],19:[function(require,module,exports){
var Html = require('./html');

function Fast() {
  this._autoclose  = 'base basefont bgsound link meta area br embed img keygen wbr input menuitem param source track hr col frame'.split(/\s/);
  this._format = 'xhtml';
  this._attrQuote = '"';
  this._jsWrapper = ['\n//<![CDATA[\n', '\n//]]>\n'];
}

var p = Fast.prototype = new Html();

p.on_html_doctype = function(exps) {
  var type = exps[2];

  var html = '<!DOCTYPE html>';

  var XHTML_DOCTYPES = {
    '1.1'          : '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">',
    '5'            : html,
    'html'         : html,
    'basic'        : '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML Basic 1.1//EN" "http://www.w3.org/TR/xhtml-basic/xhtml-basic11.dtd">',
    'frameset'     : '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Frameset//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-frameset.dtd">',
    'strict'       : '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">',
    'svg'          : '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
    'transitional' : '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
  };

  var HTML_DOCTYPES = {
    '5'            : html,
    'html'         : html,
    'frameset'     : '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Frameset//EN" "http://www.w3.org/TR/html4/frameset.dtd">',
    'strict'       : '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" "http://www.w3.org/TR/html4/strict.dtd">',
    'transitional' : '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">'
  };

  type = type.toString().toLowerCase();
  var m, str;

  m = /^xml(\s+(.+))?$/.exec(type);
  if (m) {
    if (this._format !== 'xhtml') {
      throw new Error('Invalid xml directive in html mode');
    }
    var w = this._attrQuote;
    str = '<?xml version=' + w + '1.0' + w + ' encoding=' + w + (m[2] || 'utf-8') + w + ' ?>';
  } else if (this._format !== 'xhtml') {
    str = HTML_DOCTYPES[type];
    if (!str) {
      throw new Error('Invalid html doctype ' + type);
    }
  } else {
    str = XHTML_DOCTYPES[type];
    if (!str) {
      throw new Error('Invalid xhtml doctype ' + type);
    }
  }

  return ['static', str];
};

p.on_html_comment = function(exps) {
  return ['multi', ['static', '<!--'], this.compile(exps[2]), ['static', '-->']];
};

p.on_html_condcomment = function(exps) {
  return this.on_html_comment(['html', 'comment', [
    'multi',
      ['static', '[' + exps[2] + ']>'], exps[3], ['static', '<![endif]']]]);
};

p.on_html_tag = function(exps) {
  var name = exps[2].toString(), attrs = exps[3], content = exps[4];

  var closed = !content || (this._isEmptyExp(content) && this._autoclose.indexOf(name) !== -1);

  var res = [
    'multi',
      ['static', '<' + name],
      this.compile(attrs),
      ['static', (closed && this._format === 'xhtml' ? ' /' : '') + '>']
    ];

  if (content) {
    res.push(this.compile(content));
  }
  if (!closed) {
    res.push(['static', '</' + name + '>']);
  }
  return res;
};

p.on_html_attrs = p._shiftAndCompileMulti;

p.on_html_attr = function(exps) {
  var name = exps[2], value = exps[3];

  if (this._format !== 'xhtml' && this._isEmptyExp(value)) {
    return ['static', ' ' + name];
  }
  return ['multi',
    ['static', ' ' + name + '=' + this._attrQuote],
    this.compile(value),
    ['static', this._attrQuote]];
};

p.on_html_js = function(exps) {
  var content = exps[2];

  return ['multi',
     ['static', this._jsWrapper[0]],
     this.compile(content),
     ['static', this._jsWrapper[1]]];
};

module.exports = Fast;

},{"./html":20}],20:[function(require,module,exports){
var Filter = require('../filter');

function Html() {}
var p = Html.prototype = new Filter();

p.on_html_attrs = p._shiftAndCompile;

p.on_html_attr = function(exps) {
  return ['html', 'attr', exps[2], this.compile(exps[3])];
};

p.on_html_comment = function(exps) {
  return ['html', 'comment', this.compile(exps[2])];
};

p.on_html_condcomment = function(exps) {
  return ['html', 'condcomment', exps[2], this.compile(exps[3])];
};

p.on_html_tag = function(exps) {
  var content = exps[4];
  var res = ['html', 'tag', exps[2], this.compile(exps[3])];
  if (content) {
    res.push(this.compile(content));
  }
  return res;
};

p._isContainNonEmptyStatic = function(exp) {
  switch (exp[0]) {
  case 'multi':
    for (var i = 1, l = exp.length; i < l; i++) {
      if (this._isContainNonEmptyStatic(exp[i])) {
        return true;
      }
    }
    return false;
  case 'escape':
    return this._isContainNonEmptyStatic(exp[exp.length - 1]);
  case 'static':
    return exp[1].length;
  default:
    return false;
  }
};

module.exports = Html;

},{"../filter":4}],21:[function(require,module,exports){
var attrDelimRe = /^\s*([\(\)\[\]])/;
var blockExpressionRe = /^\s*:\s*/;
var closedTagRe = /^\s*\/\s*/;
var delimRe = /^[\(\[]/;
var doctypeRe = /^doctype\b/i;
var embededRe = /^(\w+):\s*$/;
var emptyLineRe = /^\s*$/;
var htmlCommentRe = /^\/!(\s?)/;
var htmlConditionalCommentRe = /^\/\[\s*(.*?)\s*\]\s*$/;
var indentRegex  = /^[ \t]+/;
var indentationRe = /^\s+/;
var newLineRe = /\r?\n/;
var nextLineRe = /[,\\]$/;
var outputBlockRe = /^=(=?)([<>]*)/;
var outputCodeRe  = /^\s*=(=?)([<>]*)/;
var tabRe = /\t/g;
var textBlockRe = /^((\.)(\s|$))|^((\|)(\s?))/;
var textContentRe = /^( ?)(.*)$/;

var tagRe = /^(?:#|\.|\*(?=[^\s]+)|(\w+(?:\w+|:|-)*\w|\w+))/;
var attrShortcutRe = /^([\.#]+)((?:\w+|-)*)/;

var attrName = '^\\s*((?!\\${)[^\\0\\"\'><\\/=\\s\\[\\]()\\.#]+)';
var quotedAttrRe = new RegExp(attrName + '\\s*=(=?)\\s*("|\')');
var codeAttrRe = new RegExp(attrName + '\\s*=(=?)\\s*');

var tagShortcut = {
  '.': 'div',
  '#': 'div'
};
var attrShortcut = {
  '#': ['id'],
  '.': ['class']
};
var attrDelims = {
  '(': ')',
  '[': ']'
};

function Parser() { }

var p = Parser.prototype;

p._escapeRegExp = function(str) {
  if (!str) {
    return '';
  }
  return str.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, '\\$&');
};

p._reset = function(lines, stacks) {
  // Since you can indent however you like in Slm, we need to keep a list
  // of how deeply indented you are. For instance, in a template like this:
  //
  //   doctype       # 0 spaces
  //   html          # 0 spaces
  //    head         # 1 space
  //       title     # 4 spaces
  //
  // indents will then contain [0, 1, 4] (when it's processing the last line.)

  // We uses this information to figure out how many steps we must "jump"
  // out when we see an de-indented line.
  this._indents = [];

  //  Whenever we want to output something, we'll *always* output it to the
  //  last stack in this array. So when there's a line that expects
  //  indentation, we simply push a new stack onto this array. When it
  //  processes the next line, the content will then be outputted into that
  //  stack.
  this._stacks = stacks || [];

  this._lineno = 0;
  this._lines = lines;
  this._line = this._origLine = null;

  this._indents._last = this._stacks._last = function() {
    return this[this.length - 1];
  };
};

p._pushOnTop = function(item) {
  this._stacks._last().push(item);
};

p._sliceLine = function(beginSlice) {
  this._line = this._line.slice(beginSlice);
};

p._nextLine = function() {
  if (this._lines.length) {
    this._origLine = this._lines.shift();
    this._lineno++;
    this._line = this._origLine;
  } else {
    this._origLine = this._line = null;
  }

  return this._line;
};

p._getIndent = function(line) {
  // Figure out the indentation. Kinda ugly/slow way to support tabs,
  // but remember that this is only done at parsing time.
  var m = line.match(indentRegex);
  return m ? m[0].replace(tabRe, ' ').length : 0;
};

p.exec = function(str, options) {
  if (options && options.filename) {
    this._file = options.filename;
  } else {
    this._file = null;
  }
  var res = ['multi'];
  this._reset(str.split(newLineRe), [res]);

  while (this._nextLine() !== null) {
    this._parseLine();
  }

  this._reset();

  return res;
};

p._parseLine = function() {
  if (emptyLineRe.test(this._line)) {
    this._pushOnTop(['newline']);
    return;
  }

  var indent = this._getIndent(this._line);

  // Choose first indentation yourself
  if (!this._indents.length) {
    this._indents.push(indent);
  }

  // Remove the indentation
  this._line = this._line.replace(indentationRe, '');

  // If there's more stacks than indents, it means that the previous
  // line is expecting this line to be indented.
  var expectingIndentation = this._stacks.length > this._indents.length;

  if (indent > this._indents._last()) {
    // This line was actually indented, so we'll have to check if it was
    // supposed to be indented or not.

    if (!expectingIndentation) {
      this._syntaxError('Unexpected indentation');
    }

    this._indents.push(indent);
  } else {
    // This line was *not* indented more than the line before,
    // so we'll just forget about the stack that the previous line pushed.
    if (expectingIndentation) {
      this._stacks.pop();
    }

    // This line was deindented.
    // Now we're have to go through the all the indents and figure out
    // how many levels we've deindented.
    while (indent < this._indents._last() && this._indents.length > 1) {
      this._indents.pop();
      this._stacks.pop();
    }

    // This line's indentation happens lie "between" two other line's
    // indentation:
    //
    //   hello
    //       world
    //     this      # <- This should not be possible!

    if (indent !== this._indents._last()) {
      this._syntaxError('Malformed indentation');
    }
  }

  this._parseLineIndicators();
};

var _parseHtmlComment = function(parser, m) {
  parser._pushOnTop(['html', 'comment',
    [
      'slm', 'text',
      parser._parseTextBlock(parser._line.slice(m[0].length),
      parser._indents._last() + m[1].length + 2)
    ]
  ]);
};

var _parseHtmlConditionalComment = function(parser, m) {
  var block = ['multi'];
  parser._pushOnTop(['html', 'condcomment', m[1], block]);
  parser._stacks.push(block);
};

var _parseTextBlock = function(parser, m) {
  var char, space;
  if (m[2] === undefined) {
    char = m[5];
    space = m[6];
  } else {
    char = m[2];
    space = m[3];
  }
  var trailingWS = char === '.';

  parser._pushOnTop([
    'slm', 'text',
    parser._parseTextBlock(parser._line.slice(m[0].length),
    parser._indents._last() + space.length + 1)
  ]);

  if (trailingWS) {
    parser._pushOnTop(['static', ' ']);
  }
};

var _parseOutputBlock = function(parser, m) {
  // We expect the line to be broken or the next line to be indented.
  parser._sliceLine(m[0].length);

  var trailingWS = m[2].indexOf('>') !== -1;
  var block = ['multi'];
  if (m[2].indexOf('<') !== -1) {
    parser._pushOnTop(['static', ' ']);
  }
  parser._pushOnTop(['slm', 'output', m[1].length === 0, parser._parseBrokenLine(), block]);
  if (trailingWS) {
    parser._pushOnTop(['static', ' ']);
  }
  parser._stacks.push(block);
};

var _parseEmbeded = function(parser, m) {
  // It is treated as block.
  parser._pushOnTop(['slm', 'embedded', m[1], parser._parseTextBlock()]);
};


var _parseCommentBlock = function(parser) {
  while (parser._lines.length) {
    if (!emptyLineRe.test(parser._lines[0])) {
      var indent = parser._getIndent(parser._lines[0]);
      if (indent <= parser._indents._last()) {
        break;
      }
    }

    parser._nextLine();
    parser._pushOnTop(['newline']);
  }
};

var _parseInlineHtml = function(parser) {
  var block = ['multi'];
  parser._pushOnTop(['multi', ['slm', 'interpolate', parser._line], block]);
  parser._stacks.push(block);
};

var _parseCodeBlock = function(parser) {
  // We expect the line to be broken or the next line to be indented.
  parser._sliceLine(1);
  var block = ['multi'];
  parser._pushOnTop(['slm', 'control', parser._parseBrokenLine(), block]);
  parser._stacks.push(block);
};

var _parseDoctype = function(parser, m) {
  var value = parser._line.slice(m[0].length).trim();
  parser._pushOnTop(['html', 'doctype', value]);
};

var _parseTag = function(parser, m) {
  if (m[1]) {
    parser._sliceLine(m[0].length);
  }
  parser._parseTag(m[0]);
};

p._matchLineThen = function(regex, next) {
  var m = regex.exec(this._line);
  if (m) {
    next(this, m);
    return true;
  }
  return false;
};

p._ifTrueThen = function(condition, next) {
  if (condition) {
    next(this);
    return true;
  }

  return false;
};

p._parseLineIndicators = function() {
  for (;;) {
    var firstChar = this._line[0];

    if (
      // HTML comment
      this._matchLineThen(htmlCommentRe, _parseHtmlComment) ||
      // or HTML conditional comment
      this._matchLineThen(htmlConditionalCommentRe, _parseHtmlConditionalComment) ||
      // Slm comment
      this._ifTrueThen(firstChar === '/', _parseCommentBlock) ||
      // Text block.
      this._matchLineThen(textBlockRe, _parseTextBlock) ||
      // Inline html
      this._ifTrueThen(firstChar === '<', _parseInlineHtml) ||
      // Code block.
      this._ifTrueThen(firstChar === '-', _parseCodeBlock) ||
      // Output block.
      this._matchLineThen(outputBlockRe, _parseOutputBlock) ||
      // Embedded template.
      this._matchLineThen(embededRe, _parseEmbeded) ||
      // Doctype declaration
      this._matchLineThen(doctypeRe, _parseDoctype) ||
      // HTML tag
      this._matchLineThen(tagRe, _parseTag)) {
        this._pushOnTop(['newline']);
        return;
      }
    this._syntaxError('Unknown line indicator');
  }
};

p._parseTag = function(tag) {
  var m, trailingWS, leadingWS;
  if (tagShortcut[tag]) {
    tag = tagShortcut[tag];
  }

  // Find any shortcut attributes
  var attributes = ['html', 'attrs'];
  while ((m = attrShortcutRe.exec(this._line))) {
    // The class/id attribute is :static instead of 'slm' 'interpolate',
    // because we don't want text interpolation in .class or #id shortcut
    var shortcut = attrShortcut[m[1]];
    if (!shortcut) {
      this._syntaxError('Illegal shortcut');
    }

    for (var i = 0, il = shortcut.length; i < il; i++) {
      attributes.push(['html', 'attr', shortcut[i], ['static', m[2]]]);
    }

    this._sliceLine(m[0].length);
  }

  m = /^[<>]+/.exec(this._line);
  if (m) {
    this._sliceLine(m[0].length);
    trailingWS = m[0].indexOf('>') !== -1;
    leadingWS = m[0].indexOf('<') !== -1;
  }

  this._parseAttributes(attributes);

  tag = ['html', 'tag', tag, attributes];

  if (leadingWS) {
    this._pushOnTop(['static', ' ']);
  }
  this._pushOnTop(tag);
  if (trailingWS) {
    this._pushOnTop(['static', ' ']);
  }

  for(;;) {
    // Block expansion
    m = blockExpressionRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      if (!(m = tagRe.exec(this._line))) {
        this._syntaxError('Expected tag');
      }

      if (m[1]) {
        this._sliceLine(m[0].length);
      }

      var content = ['multi'];
      tag.push(content);

      var sl = this._stacks.length;
      this._stacks.push(content);
      this._parseTag(m[0]);
      this._stacks.splice(sl, 1);

      break;
    }

    // Handle output code
    m = outputCodeRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      var trailingWS2 = m[2].indexOf('>') !== -1;

      var block = ['multi'];

      if (!leadingWS && m[2].indexOf('<') !== -1) {
        var lastStack = this._stacks._last();
        lastStack.splice(lastStack.length - 1, 0, ['static', ' ']);
      }

      tag.push(['slm', 'output', m[1] !== '=', this._parseBrokenLine(), block]);
      if (!trailingWS && trailingWS2) {
        this._pushOnTop(['static', ' ']);
      }
      this._stacks.push(block);
      break;
    }

    // Closed tag. Do nothing
    m = closedTagRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      if (this._line.length) {
        this._syntaxError('Unexpected text after closed tag');
      }
      break;
    }

    // Empty content
    if (emptyLineRe.test(this._line)) {
      var emptyContent = ['multi'];
      tag.push(emptyContent);
      this._stacks.push(emptyContent);
      break;
    }

    // Text content
    m = textContentRe.exec(this._line);
    if (m) {
      tag.push(['slm', 'text', this._parseTextBlock(m[2], this._origLine.length - this._line.length + m[1].length, true)]);
      break;
    }

    break;
  }
};

p._parseAttributes = function(attributes) {
  // Check to see if there is a delimiter right after the tag name
  var delimiter, m;

  m = attrDelimRe.exec(this._line);
  if (m) {
    delimiter = attrDelims[m[1]];
    this._sliceLine(m[0].length);
  }

  var booleanAttrRe, endRe;
  if (delimiter) {
    booleanAttrRe = new RegExp(attrName + '(?=(\\s|' + this._escapeRegExp(delimiter) + '|$))');
    endRe = new RegExp('^\\s*' + this._escapeRegExp(delimiter));
  }

  while (true) {
    // Value is quoted (static)
    m = quotedAttrRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      attributes.push(['html', 'attr', m[1],
                      ['escape', !m[2].length, ['slm', 'interpolate', this._parseQuotedAttribute(m[3])]]]);
      continue;
    }

    // Value is JS code
    m = codeAttrRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      var name = m[1], escape = !m[2].length;
      var value = this._parseJSCode(delimiter);

      if (!value.length) {
        this._syntaxError('Invalid empty attribute');
      }
      attributes.push(['html', 'attr', name, ['slm', 'attrvalue', escape, value]]);
      continue;
    }

    if (!delimiter) {
      break;
    }

    // Boolean attribute
    m = booleanAttrRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      attributes.push(['html', 'attr', m[1], ['multi']]);
      continue;
    }
    // Find ending delimiter
    m = endRe.exec(this._line);
    if (m) {
      this._sliceLine(m[0].length);
      break;
    }

    // Found something where an attribute should be
    this._line = this._line.replace(indentationRe, '');
    if (this._line.length) {
      this._syntaxError('Expected attribute');
    }

    // Attributes span multiple lines
    this._pushOnTop(['newline']);

    if (!this._lines.length) {
      this._syntaxError('Expected closing delimiter ' + delimiter);
    }
    this._nextLine();
  }
};

p._parseTextBlock = function(firstLine, textIndent, inTag) {
  var result = ['multi'];

  if (!firstLine || !firstLine.length) {
    textIndent = null;
  } else {
    result.push(['slm', 'interpolate', firstLine]);
  }

  var emptyLines = 0;

  while (this._lines.length) {
    if (emptyLineRe.test(this._lines[0])) {
      this._nextLine();
      result.push(['newline']);

      if (textIndent) {
        emptyLines++;
      }
    } else {
      var indent = this._getIndent(this._lines[0]);

      if (indent <= this._indents._last()) {
        break;
      }

      if (emptyLines) {
        result.push(['slm', 'interpolate', new Array(emptyLines + 1).join('\n')]);
        emptyLines = 0;
      }

      this._nextLine();
      this._line = this._line.replace(indentationRe, '');

      // The text block lines must be at least indented
      // as deep as the first line.

      var offset = textIndent ? indent - textIndent : 0;

      if (offset < 0) {
        this._syntaxError('Text line not indented deep enough.\n' +
                         'The first text line defines the necessary text indentation.' +
                         (inTag ? '\nAre you trying to nest a child tag in a tag containing text? Use | for the text block!' : ''));
      }

      result.push(['newline']);
      result.push(['slm', 'interpolate', (textIndent ? '\n' : '') + new Array(offset + 1).join(' ') + this._line]);

      // The indentation of first line of the text block
      // determines the text base indentation.
      textIndent = textIndent || indent;
    }
  }

  return result;
};


p._parseBrokenLine = function() {
  var brokenLine = this._line.trim(), m;
  while ((m = nextLineRe.exec(brokenLine))) {
    this._expectNextLine();
    if (m[0] === '\\') {
      brokenLine = brokenLine.slice(0, brokenLine.length - 2);
    }
    brokenLine += '\n' + this._line;
  }
  return brokenLine;
};

p._parseJSCode = function(outerDelimeter) {
  var code = '', count = 0, delimiter, closeDelimiter, m;

  // Attribute ends with space or attribute delimiter
  var endRe = new RegExp('^[\\s' + this._escapeRegExp(outerDelimeter) + ']');

  while (this._line.length && (count || !endRe.test(this._line))) {
    m = nextLineRe.exec(this._line);
    if (m) {
      if (m[0] === '\\') {
        code += this._line.slice(0, this._line.length - 2);
      } else  {
        code += this._line;
      }
      code += '\n';
      this._expectNextLine();
    } else {
      if (count > 0) {
        if (this._line[0] === delimiter[0]) {
          count++;
        } else if (this._line[0] === closeDelimiter[0]) {
          count--;
        }
      } else {
        m = delimRe.exec(this._line);
        if (m) {
          count = 1;
          delimiter = m[0];
          closeDelimiter = attrDelims[delimiter];
        }
      }

      code += this._line[0];
      this._sliceLine(1);
    }
  }

  if (count) {
    this._syntaxError('Expected closing delimiter ' + closeDelimiter);
  }
  return code;
};

p._parseQuotedAttribute = function(quote) {
  var value = '', count = 0;

  while (count !== 0 || this._line[0] !== quote) {
    var m = /^(\\)?$/.exec(this._line);
    if (m) {
      value += m[1] ? ' ' : '\n';
      this._expectNextLine();
    } else {
      var firstChar = this._line[0];
      if (count > 0) {
        if (firstChar === '{') {
          count++;
        } else if (firstChar === '}') {
          count--;
        }
      } else if (/^\$\{/.test(this._line)) {
        value += firstChar;
        this._sliceLine(1);
        count = 1;
      }

      value += this._line[0];
      this._sliceLine(1);
    }
  }

  this._sliceLine(1);

  return value;
};

p._syntaxError = function(message) {
  var column = (this._origLine !== null && this._line !== null) ? this._origLine.length - this._line.length : 0;
  column += 1;
  var msg = [
    message,
    '  ' + (this._file || '(__TEMPLATE__)') + ', Line ' + this._lineno + ', Column ' + column,
    '  ' + (this._origLine || ''),
    '  ' + new Array(column).join(' ') + '^',
    ''
  ].join('\n');
  throw new Error(msg);
};

p._expectNextLine = function() {
  if (this._nextLine() === null) {
    this._syntaxError('Unexpected end of file');
  }
  this._line = this._line.trim();
};

module.exports = Parser;

},{}],22:[function(require,module,exports){
var Template = require('./template');
var template = new Template(require('./vm_browser'));

module.exports = template.exports();

},{"./template":23,"./vm_browser":25}],23:[function(require,module,exports){
var AttrMerge = require('./filters/attr_merge');
var AttrRemove = require('./filters/attr_remove');
var Brackets = require('./filters/brackets');
var CodeAttributes = require('./filters/code_attributes');
var ControlFlow = require('./filters/control_flow');
var Controls = require('./filters/controls');
var Embeddeds = require('./filters/embedded');
var Engine = require('./engine');
var Escape = require('./filters/escape');
var FastHtml = require('./html/fast');
var Interpolate = require('./filters/interpolate');
var MultiFlattener = require('./filters/multi_flattener');
var Parser = require('./parser');
var StaticMerger = require('./filters/static_merger');
var StringGenerator = require('./generators/string');

function Template(VM, options) {

  options = options || {
    mergeAttrs: { 'class': ' ' }
  };

  this.VM = VM;
  this._engine = new Engine();
  this.Embeddeds = Embeddeds;

  this._embedded = new Embeddeds.Embedded();

  this.registerEmbedded('script',     new Embeddeds.Javascript());
  this.registerEmbedded('javascript', new Embeddeds.Javascript({typeAttribute: true}));
  this.registerEmbedded('css',        new Embeddeds.CSS());

  var filters = this._defaultFilters(options);
  for (var i = 0, il = filters.length; i < il; i++) {
    this._engine.use(filters[i]);
  }
}

var p = Template.prototype;

p._defaultFilters = function(options) {
  return [
    new Parser(),
    this._embedded,
    new Interpolate(),
    new Brackets(),
    new Controls(),
    new AttrMerge(options.mergeAttrs),
    new CodeAttributes(options.mergeAttrs),
    new AttrRemove(options.mergeAttrs),
    new FastHtml(),
    new Escape(),
    new ControlFlow(),
    new MultiFlattener(),
    new StaticMerger(),
    new StringGenerator()
  ];
};

p.registerEmbedded = function(name, engine) {
  this._embedded.register(name, engine);
};

p.registerEmbeddedFunction = function(name, renderer) {
  var engine = new this.Embeddeds.InterpolateEngine(renderer);
  this.registerEmbedded(name, engine);
};

p.render = function(src, model, options, vm) {
  vm = vm || new this.VM();
  return this.compile(src, options, vm)(model, vm);
};

p.compile = function(src, options, vm) {
  vm = vm || new this.VM();

  var fn = this.exec(src, options, vm);

  var fnWrap = function(model) {
    var res = fn.call(model, vm);
    vm.reset();
    return res;
  };
  return fnWrap;
};

p.exec = function(src, options, vm) {
  options = options || {};

  if (options.useCache !== undefined && !options.useCache) {
    vm._load = vm._loadWithoutCache;
  }

  vm.template = this;
  vm.basePath = options.basePath;
  vm.filename = options.filename;
  vm.require  = options.require || module.require;
  vm.rebind();

  return vm.runInContext(this.src(src, options), vm.filename)[0];
};

p.src = function(src, options) {
  return [
    '[function(vm) {',
    'vm.m = this;',
    'var sp = vm.stack.length, require = vm.require, content = vm._content, extend = vm._extend, partial = vm._partial, j = vm.j;',
    this._engine.exec(src, options),
    'vm.res=_b;return vm.pop(sp);}]'
  ].join('');
};

p.exports = function() {
  return {
    Template: Template,
    template: this,
    compile:  this.compile.bind(this),
    render:   this.render.bind(this)
  };
};

module.exports = Template;

},{"./engine":3,"./filters/attr_merge":5,"./filters/attr_remove":6,"./filters/brackets":7,"./filters/code_attributes":8,"./filters/control_flow":9,"./filters/controls":10,"./filters/embedded":11,"./filters/escape":12,"./filters/interpolate":13,"./filters/multi_flattener":14,"./filters/static_merger":16,"./generators/string":18,"./html/fast":19,"./parser":21}],24:[function(require,module,exports){
var ampRe = /&/g;
var escapeRe = /[&<>"]/;
var gtRe = />/g;
var ltRe = /</g;
var quotRe = /"/g;

function SafeStr(val) {
  this.htmlSafe = true;
  this._val = val;
}

SafeStr.prototype.toString = function() {
  return this._val;
};

function safe(val) {
  if (!val || val.htmlSafe) {
    return val;
  }

  return new SafeStr(val);
}

function j(val) {
  var str = JSON.stringify(val) + '';
  return str.replace(/<\//g, "<\\/");
}

function escape(str) {
  if (typeof str !== 'string') {
    if (!str) {
      return '';
    }
    if (str.htmlSafe) {
      return str.toString();
    }
    str = str.toString();
  }

  if (escapeRe.test(str) ) {
    if (str.indexOf('&') !== -1) {
      str = str.replace(ampRe, '&amp;');
    }
    if (str.indexOf('<') !== -1) {
      str = str.replace(ltRe, '&lt;');
    }
    if (str.indexOf('>') !== -1) {
      str = str.replace(gtRe, '&gt;');
    }
    if (str.indexOf('"') !== -1) {
      str = str.replace(quotRe, '&quot;');
    }
  }

  return str;
}

function rejectEmpty(arr) {
  var res = [];

  for (var i = 0, l = arr.length; i < l; i++) {
    var el = arr[i];
    if (el !== null && el.length) {
      res.push(el);
    }
  }

  return res;
}

function flatten(arr) {
  return arr.reduce(function (acc, val) {
    if (val === null) {
      return acc;
    }
    return acc.concat(val.constructor === Array ? flatten(val) : val.toString());
  }, []);
}

VM._cache = {};

function VM() {
  this.reset();
  this.template = this.basePath = null;
  this._cache = VM._cache;
}

var VMProto = VM.prototype;

VM.escape = VMProto.escape = escape;
VM.safe = VMProto.safe = safe;
VMProto.j = j;
VMProto.flatten = flatten;
VMProto.rejectEmpty = rejectEmpty;

VMProto.resetCache = function() {
  this._cache = VM._cache = {};
};

VMProto.cache = function(name, value) {
  this._cache[name] = value;
};

VMProto.rebind = function() {
  this._content = this.content.bind(this);
  this._extend = this.extend.bind(this);
  this._partial = this.partial.bind(this);
};

VMProto._loadWithCache = function(path) {
  var fn = this._cache[path];
  if (fn) {
    return fn;
  }

  var result = this._cache[path] = this._loadWithoutCache(path);
  return result;
};

VMProto._load = VMProto._loadWithCache;

/*
  Prepare VM for next template rendering
*/
VMProto.reset = function() {
  this._contents = {};
  this.res = '';
  this.stack = [];
  this.m = null;
};

/*
  Pop stack to sp
*/
VMProto.pop = function(sp) {
  var currentFilename = this.filename;
  var l = this.stack.length;
  while (sp < l--) {
    this.filename = this.stack.pop();
    this._load(this.filename).call(this.m, this);
  }
  this.filename = currentFilename;
  return this.res;
};

VMProto.extend = function(path) {
  this.stack.push(this._resolvePath(path));
};

VMProto.partial = function(path, model, cb) {
  var stashedResult = this.res;
  if (cb) {
    this.res = cb.call(this.m, this);
  }

  if (model === undefined) {
    model = this.m;
  }

  path = this._resolvePath(path);

  var f = this._load(path), stashedFilename = this.filename, stashedModel = this.m;
  this.filename = path;
  var res = safe(f.call(this.m = model, this));
  this.m = stashedModel;
  this.filename = stashedFilename;
  this.res = stashedResult;
  return res;
};

VMProto.content = function() {
  var cb, mod, name;
  switch (arguments.length) {
    case 0: // return main content
      return safe(this.res);
    case 1: // return named content
      return safe(this._contents[arguments[0]] || '');
    case 2: // capture named content
      name = arguments[0];
      cb = arguments[1];
      if (name) {
        // capturing block
        this._contents[name] = cb.call(this.m);
        return '';
      }
      return cb.call(this.m);
    case 3: // content operations: default, append, prepend
      name = arguments[0];
      mod = arguments[1];
      cb = arguments[2];
      var contents = this._contents[name] || '';
      switch (mod) {
        case 'default':
          return safe(contents || cb.call(this.m));
        case 'append':
          this._contents[name] = contents + cb.call(this.m);
          return '';
        case 'prepend':
          this._contents[name] = cb.call(this.m) + contents;
          return '';
      }
  }
};

module.exports = VM;

},{}],25:[function(require,module,exports){
var VM = require('./vm');

function VMBrowser() { VM.call(this); }

var p = VMBrowser.prototype = new VM();

p.runInContext = function(src, filename) {
  if (filename) {
    src += '\n//# sourceURL=' + filename;
  }
  return eval(src);
};

p._resolvePath = function() {};

module.exports = VMBrowser;

},{"./vm":24}]},{},[1]);
