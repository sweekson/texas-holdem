/* global Event EventTarget Blob MutationObserver URL */
/* global location angular */

(function (angular) {
  angular.module('util', [])
    .directive('ngFileModel', NgFileModelDirective)
    .directive('autoScroll', AutoScrollDirective)
    .directive('scroll', ScrollDirective)
    .directive('clickOnOthers', ClickOnOthersDirective)
    .service('coercion', CoercionService)
    .service('url', UrlService)
    .service('dropdowns', DropdownsService)
    .service('reader', ReaderService)
    .service('downloader', DownloaderService)
    .service('logger', LoggerService)
    .service('bools', BoolsService);

  /* directive */
  function NgFileModelDirective () {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: (scope, elem, attrs, ngModel) => {
        const multiple = attrs.multiple;
        elem.on('change', e => {
          ngModel.$setViewValue(multiple ? e.target.files : e.target.files[0]);
        });
      }
    };
  }

  /* directive */
  function AutoScrollDirective () {
    const config = { attributes: false, childList: true, subtree: true };
    return {
      restrict: 'A',
      link: (scope, elem, attrs) => {
        const node = elem[0];
        const bottomBound = Number(attrs.bottomBound);
        const scrollToBottom = () => {
          const scrollTop = node.scrollTop;
          const clientHeight = node.clientHeight;
          const scrollHeight = node.scrollHeight;
          const shouldScroll = (scrollHeight - scrollTop - clientHeight) <  bottomBound;
          shouldScroll && (node.scrollTop = scrollHeight);
        };
        const observer = new MutationObserver(_ => {
          bottomBound && scrollToBottom();
        });
        observer.observe(node, config);
      }
    };
  }

  /* directive */
  function ScrollDirective () {
    return {
      restrict: 'A',
      link: (scope, elem, attrs) => {
        const target = document.querySelector(attrs.scrollTarget);

        if (!target) { return ;}

        elem.on('click', e => {
          switch (attrs.scroll) {
            case 'top':
              target.scrollTop = 0;
              break;
            case 'right':
              target.scrollLeft = target.scrollWidth;
              break;
            case 'bottom':
              target.scrollTop = target.scrollHeight;
              break;
            case 'left':
              target.scrollLeft = 0;
              break;
            default:
              break;
          }
        });
      }
    };
  }

  /* directive */
  function ClickOnOthersDirective ($parse) {
    const targets = [];

    document.addEventListener('click', e => {
      targets.forEach(elem => {
        !elem[0].contains(e.target) && elem.triggerHandler('click.directive');
      });
    });

    return {
      restrict: 'A',
      link: (scope, elem, attrs) => {
        const handler = $parse(attrs.clickOnOthers);

        targets.push(elem);

        elem.on('click.directive', _ => {
          handler(scope);
          scope.$apply();
        });
      }
    };
  }

  /* service */
  function CoercionService () {
    this.toBoolean = value => value != null && `${value}` !== 'false';
    this.toNumber = value => !isNaN(parseFloat(value)) && !isNaN(Number(value));
    this.toArray = value => Array.isArray(value) ? value : [value];
  }

  /* service */
  function UrlService () {
    this.parser = {};

    this.parser.search = (regexp, index) => {
      const matches = location.search.match(regexp);
      if (!matches) { return null; }
      return index !== undefined ? matches[index] : matches;
    };

    this.parser.patterns = params => {
      const outputs = {};
      params.forEach(param => {
        const pattern = param.pattern;
        const format = param.format;
        const output = { pattern, format };
        const value = _ => {
          const val = this.parser.search(pattern, param.match);
          return format ? format(val) : val;
        };
        Object.defineProperty(output, 'value', { get: value });
        outputs[param.key] = output;
      });
      return outputs;
    };
  }

  /* service */
  function DropdownsService () {
    const map = new Map();

    this.create = (group, table) => {
      const instance = new Dropdowns(table);
      map.set(group, instance);
      return instance;
    };

    this.get = group => map.get(group);
    this.delete = group => map.delete(group);
  }

  /* service */
  function ReaderService () {
    this.text = (file, callback) => {
      const reader = new FileReader();
      reader.onload = e => callback(e.target.result);
      reader.readAsText(file);
    };

    this.json = (file, callback) => {
      const reader = new FileReader();
      reader.onload = e => callback(JSON.parse(e.target.result));
      reader.readAsText(file);
    };
  }

  /* service */
  function DownloaderService () {
    this.download = (filename, content, type) => {
      const file = new Blob([content], { type });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = filename;
      link.click();
    };

    this.text = (filename, content) => this.download(filename, content, 'plain/text');
    this.json = (filename, content) => this.download(filename, content, 'application/json');
  }

  /* service */
  function LoggerService ($timeout) {
    const emitter = new EventTarget();
    const logs = [];

    this.format = value => {
      if (Array.isArray(value)) {
        return { messages: value };
      }

      if (typeof value === 'object') {
        return value;
      }

      return { messages: [value] };
    };

    this.logs = _ => logs.slice(0);

    /**
     * @param {Object|Array|String} value
     */
    this.log = value => $timeout(() => this.flush(this.format(value)), 10);
    this.info = value => this.log(Object.assign(this.format(value), { level: 'info' }));
    this.warn = value => this.log(Object.assign(this.format(value), { level: 'warn' }));
    this.error = value => this.log(Object.assign(this.format(value), { level: 'error' }));

    this.flush = log => {
      logs.push(log);
      emitter.dispatchEvent(Object.assign(new Event('flush'), { data : log }));
    };

    this.clear = _ => logs.splice(0) && emitter.dispatchEvent(new Event('flush'));
    this.onflush = callback => emitter.addEventListener('flush', callback);
    this.onchange = callback => emitter.addEventListener('change', callback);
  }

  /* service */
  function BoolsService () {
    const map = new Map();

    this.create = (group, table, options) => {
      const bools = new BoolsToogle(table, options);
      map.set(group, bools);
      return bools;
    };

    this.get = group => map.get(group);
    this.delete = group => map.delete(group);
  }

  class BoolsToogle extends EventTarget {
    constructor(table, options) {
      super();
      this.state = new Map();
      this.options = options || {};
      this.coercion = new CoercionService();
      this.init(table || {});
    }

    init(table) {
      const fill = this.options.fill;
      if (Array.isArray(table)) {
        table.forEach(key => this.state.set(key, fill !== undefined ? fill : false));
      } else if (typeof table === 'object') {
        Object.keys(table).forEach(key => this.state.set(key, !!table[key]));
      }
      this.emit('inited');
      return this;
    }

    toggle(key, value) {
      const bool = this.coercion.toBoolean(value);
      const single = this.options.single;
      single && [...this.state.keys()].forEach(key => this.state.set(key, false));
      this.state.set(key, value !== undefined ? bool : !this.state.get(key));
      this.emit('change', { key, value: bool });
      return this;
    }

    active (key) {
      return this.state.get(key);
    }

    emit (type, data) {
      const event = new Event(type);
      event.data = data;
      this.dispatchEvent(event);
    }

    on (type, callback) {
      this.addEventListener(type, callback);
    }
  }

  class Dropdowns extends BoolsToogle {
    open(key) {
      this.state.set(key, true);
      this.emit('change', { key, value: true });
    }

    close(key) {
      this.state.set(key, false);
      this.emit('change', { key, value: false });
    }
  }
})(angular);
