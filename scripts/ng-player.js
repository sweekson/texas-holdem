
angular.module('player', ['ngSanitize', 'util'])

.factory('bot', () => new PokerBaseBot())
.factory('game', (bot) => new PokerGame({ bot }))
.factory('model', () => new PokerActionModel())

.service('converter', function () {
  const symbols = {
    H: 'hearts',
    D: 'diamonds',
    S: 'spades',
    C: 'clubs',
  };
  const entities = {
    H: '&hearts;',
    D: '&diams;',
    S: '&spades;',
    C: '&clubs;',
  };
  const actions = ['fold', 'check', 'bet', 'raise', 'call', 'allin'];

  this.card = value => {
    const number = value[0];
    const symbol = symbols[value[1]];
    const entity = entities[value[1]];
    return { number, symbol, entity };
  };

  this.player = data => {
    const name = data.name;
    const chips = data.chips;
    const folded = data.folded !== undefined ? Number(data.folded) : '-';
    const allin = data.allin !== undefined ? Number(data.allin) : '-';
    const online = data.online !== undefined ? Number(data.online) : '-';
    const survive = data.survive !== undefined ? Number(data.survive) : '-';
    const human = data.human !== undefined ? Number(data.human) : '-';
    const self = data.self;
    return { name, chips, cards, bet, folded, allin, online, survive, human, self };
  };

  this.action = index => actions[index];
})

.service('collector', function () {
  const games = new Map();

  this.game = table => games.set(table.number, table);

  this.over = data => {

  };

  this.push = action => this.actions.push(action);
})

.controller('RootCtrl', ($scope, $window, logger, bools, game) => {
  $scope.logger = logger;
  $scope.tabs = bools.create('tabs', {
    connect: true,
    watch: false
  });
  $scope.game = game;
  $window.game = game;

  game.rx.observable.events$.subscribe(console.log);

  game.rx.observable.table.join$.subscribe(_ => {
    const name = game.player.name;
    logger.info({
      type: 'join-table',
      messages: ['(SEND JOIN)', `Player: ${name}`],
    });
    $scope.$apply();
  });

  game.rx.observable.table.joined$.subscribe(_ => {
    tabs.toggle('watch');
    logger.info({
      type: 'join-table',
      messages: ['(JOINED)'],
    });
    $scope.$apply();
  });

  game.rx.observable.game.start$.subscribe(_ => {
    const number = game.table.number;
    tabs.toggle('watch');
    logger.info({
      type: 'game-start',
      messages: ['(Table Created)', `Table: ${number}`],
    });
    $scope.$apply();
  });

  game.rx.observable.game.over$.subscribe(_ => {
    logger.info({
      type: 'game-over',
      messages: ['(GAME OVER)'],
    });
    game.players.winners.forEach(({ name, chips }) => {
      logger.info({
        type: 'game-over',
        messages: ['(WINNER)', `Player: ${name}`, `Chips: ${chips}`],
      });
    });
    $scope.$apply();
  });

  game.rx.observable.round.start$.subscribe(_ => {
    const rounds = game.table.rounds;
    const stage = game.table.stage;
    logger.info({
      type: 'round-start',
      messages: ['(NEW ROUND)', `Rounds: ${rounds}`, `Stage: ${stage}`],
    });
    $scope.$apply();
  });

  game.rx.observable.round.deal$.subscribe(_ => {
    const stage = game.table.stage;
    logger.info({
      type: 'round-stage',
      messages: ['(STAGE)', `Stage: ${stage}`],
    });
    $scope.$apply();
  });

  game.rx.observable.round.end$.subscribe(data => {
    logger.info({
      type: 'round-end',
      messages: ['(ROUND END)'],
    });
    game.players.list.forEach(({ name, chips, hand }) => {
      if (!hand) {
        return logger.info({
          type: 'round-end',
          messages: ['(HAND)', `Player: ${name}`, `Chips: ${chips}`],
        });
      }
      const cards = hand.cards.join(', ');
      const message = hand.message;
      logger.info({
        type: 'round-end',
        messages: ['(HAND)', `Player: ${name}`, `Chips: ${chips}`, `Cards: ${cards}`, `(${message})`],
      });
    });
    $scope.$apply();
  });

  game.rx.observable.players.action$.subscribe(data => {
    const action = new PlayerAction(data.action);
    logger.info({
      type: 'show-action',
      messages: ['(SHOW ACTION)', `Player: ${action.name}`, `Action: ${action.action}`, `Chips: ${action.chips}`],
      self: action.name === game.player.name
    });
    $scope.$apply();
  });
})

.controller('LoadModelCtrl', ($scope, logger, model) => {
  $scope.json = null;
  $scope.weights = null;
  $scope.loading = false;

  model.on('loaded', _ => {
    logger.info({
      type: 'system',
      messages: ['Model loaded successfully'],
    });
    $scope.loading = false;
    $scope.$apply();
  });

  $scope.load = _ => {
    if (!$scope.json || !$scope.weights) {
      return logger.warn({
        type: 'system',
        messages: ['[WARNING]', 'Model file(s) yet selected'],
      });
    }
    model.load($scope.json, $scope.weights);
    $scope.loading = true;
  }
})

.controller('ConnectServerCtrl', ($scope, logger, url, game) => {
  $scope.options = {};
  $scope.options.server = url.parser.search(/server=([\w\-.:_/]+)/, 1) || 'ws://poker-training.vtr.trendnet.org:3001';
  $scope.options.player = url.parser.search(/name=([\w_]+)/, 1) || null;
  $scope.options.bet = 50;
  $scope.options.rejoin = true;
  $scope.options.games = url.parser.search(/games=(\d+)/, 1) || 5;
  $scope.connecting = false;
  $scope.connected = false;

  game.rx.observable.socket.connected$.subscribe(_ => {
    $scope.connecting = false;
    $scope.connected = true;
    logger.info({
      type: 'system',
      messages: ['Conncted to game server'],
    });
    $scope.$apply();
  });

  game.rx.observable.socket.disconnected$.subscribe(data => {
    const code = data.event.code;
    const normal = code === 1005;
    const messages = normal ? ['Disconnected from game server'] : ['[ERROR]', 'Abnormal connection closure'];
    $scope.connecting = false;
    $scope.connected = false;
    normal && logger.info({ type: 'system', messages });
    !normal && logger.error({ type: 'system', messages });
    $scope.$apply();
  });

  $scope.connect = () => {
    if (!$scope.options.server || !$scope.options.player) {
      return logger.warn({
        type: 'system',
        messages: ['[WARNING]', 'Server URL or Player name is empty'],
      });
    }
    game.configure($scope.options);
    game.connect();
    $scope.connecting = true;
  };

  $scope.disconnect = () => game.disconnect();
  $scope.rejoin = () => $scope.options.rejoin = !$scope.options.rejoin;
})

.controller('GameInfoCtrl', ($scope, game) => {
  $scope.table = game.table;
})

.controller('CardsCtrl', ($scope, converter, game) => {
  const filter = rxjs.operators.filter;
  const map = rxjs.operators.map;

  /**
   * For testing card converting and rendering
   * $scope.hole = ['AS', '2D'].map(converter.card);
   * $scope.board = ['KS', 'TC', '9H'].map(converter.card);
   */

  $scope.hole = game.player.cards.map(converter.card);
  $scope.board = game.table.cards.map(converter.card);

  game.rx.observable.round.start$.subscribe(_ => {
    $scope.hole = game.player.cards.map(converter.card);
    $scope.board = game.table.cards.map(converter.card);
    $scope.$apply();
  });

  game.rx.observable.round.deal$.subscribe(_ => {
    $scope.hole = game.player.cards.map(converter.card);
    $scope.board = game.table.cards.map(converter.card);
    $scope.$apply();
  });
})

.controller('PlayersCtrl', ($scope, converter, game) => {
  game.rx.observable.table.joined$.subscribe(_ => {
    $scope.players = game.players.list.map(converter.player);
    $scope.$apply();
  });

  game.rx.observable.round.start$.subscribe(_ => {
    $scope.players = game.players.list.map(converter.player);
    $scope.$apply();
  });

  game.rx.observable.players.action$.subscribe(_ => $scope.$apply());
  game.rx.observable.round.end$.subscribe(_ => $scope.$apply());
})

.controller('LogsToolbarCtrl', ($scope, dropdowns, logger) => {
  const types = [
    'system',
    'join-table',
    'game-start',
    'game-over',
    'round-start',
    'round-stage',
    'round-end',
    'show-action'
  ];

  types.forEach(type => logger.filter.type.set(type, true));

  $scope.dropdowns = dropdowns.create('filters', { events: false });
  $scope.filter = logger.filter;
  $scope.all = true;
  $scope.$watch('all', all => logger.filter.custom = all ? (_ => true) : (log => log.self));
})

.controller('LogsCtrl', ($scope, logger) => {
  $scope.logs = logger.logs({ type: true });

  logger.onflush(e => {
    $scope.logs = logger.logs({ type: true });
  });

  logger.onchange(e => {
    $scope.logs = logger.logs({ type: true });
  });
});