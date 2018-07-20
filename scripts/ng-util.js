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
    .service('tabs', TabsService)
    .service('dropdowns', DropdownsService)
    .service('reader', ReaderService)
    .service('downloader', DownloaderService)
    .service('logger', LoggerService);

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
  }

  /* service */
  function TabsService () {
    this.tabs = {};

    this.set = (key, bool) => {
      this.tabs[key] = bool;
    };

    this.active = key => {
      return this.tabs[key];
    };

    this.toggle = key => {
      Object.keys(this.tabs).forEach(key => this.tabs[key] = false);
      this.tabs[key] = true;
    };
  }

  /* service */
  function DropdownsService () {
    this.dropdowns = {};

    this.set = (key, bool) => {
      this.dropdowns[key] = bool;
    };

    this.open = key => {
      this.dropdowns[key] = true;
    };

    this.close = key => {
      this.dropdowns[key] = false;
    };

    this.active = key => this.dropdowns[key];
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
    const filter = {
      _custom: _ => true,
      type: {},
      level: {},
      set custom (handler) {
        this._custom = handler;
        emitter.dispatchEvent(new Event('change'));
      },
      get custom () {
        return this._custom;
      }
    };
    const filters = { types: {}, levels: {} };

    filter.type.set = (key, bool) => (filters.types[key] = bool);
    filter.type.active = key => filters.types[key];

    filter.type.toggle = (key, bool) => {
      filters.types[key] = bool !== undefined ? bool : !filters.types[key];
      emitter.dispatchEvent(new Event('change'));
    };

    filter.level.set = (key, bool) => (filters.levels[key] = bool);
    filter.level.active = key => filters.levels[key];

    filter.level.toggle = (key, bool) => {
      filters.levels[key] = bool !== undefined ? bool : !filters.levels[key];
      emitter.dispatchEvent(new Event('change'));
    };

    this.filter = filter;

    this.format = value => {
      if (typeof value === 'object') {
        return value;
      }

      if (Array.isArray(value)) {
        return { messages: value };
      }

      return { messages: [value] };
    };

    this.logs = (compare = {}) => {
      if (compare.type && compare.level) {
        return logs.filter(({ type, level }) => filters.types[type] && filters.levels[level]).filter(filter.custom);
      }

      if (compare.type) {
        return logs.filter(({ type }) => filters.types[type]).filter(filter.custom);
      }

      if (compare.level) {
        return logs.filter(({ level }) => filters.levels[level]).filter(filter.custom);
      }

      return logs.filter(filter.custom);
    };

    this.log = messages => {
      const log = Array.isArray(messages) ? { messages } : messages;
      $timeout(() => this.flush(log), 10);
    };

    this.info = messages => {
      const log = Array.isArray(messages) ? { messages } : messages;
      log.level = 'info';
      this.log(log);
    };

    this.warn = messages => {
      const log = Array.isArray(messages) ? { messages } : messages;
      log.level = 'warn';
      this.log(log);
    };

    this.error = messages => {
      const log = Array.isArray(messages) ? { messages } : messages;
      log.level = 'error';
      this.log(log);
    };

    this.flush = log => {
      const event = new Event('flush');
      event.data = log;
      logs.push(log);
      emitter.dispatchEvent(event);
    };

    this.clear = _ => logs.splice(0) && emitter.dispatchEvent(new Event('flush'));
    this.onflush = callback => emitter.addEventListener('flush', callback);
    this.onchange = callback => emitter.addEventListener('change', callback);
  }
})(angular);
