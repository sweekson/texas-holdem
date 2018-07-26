
angular.module('player', ['ngSanitize', 'util'])

.value('config', {
  server: 'ws://poker-training.vtr.trendnet.org:3001',
  player: null,
  rejoin: true,
  games: 5
})

.factory('bot', (url) => {
  const bot = url.parser.search(/bot=(\w+)/, 1);
  return !bot ? new PokerBaseBot() : new window[bot]();
})
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
    const bet = data.bet;
    const wins = data.wins;
    const folded = data.folded !== undefined ? Number(data.folded) : '-';
    const allin = data.allin !== undefined ? Number(data.allin) : '-';
    const online = data.online !== undefined ? Number(data.online) : '-';
    const survive = data.survive !== undefined ? Number(data.survive) : '-';
    const human = data.human !== undefined ? Number(data.human) : '-';
    const self = data.self;
    return { name, chips, cards, bet, wins, folded, allin, online, survive, human, self };
  };

  this.action = index => actions[index];
})

.service('records', function (converter) {
  const games = new Map();

  this.list = [];

  this.game = table => games.set(table.number, {
    table: { number: table.number },
    actions: []
  });

  this.action = (table, player, action) => {
    const game = games.get(table.number);

    game.actions.push({
      table: {
        rounds: table.rounds,
        stage: table.stage,
        board: GameTable.board(table.cards).map(converter.card),
        bet: table.bet,
      },
      player: {
        name: player.name,
        chips: player.chips,
        cards: [],
        bet: player.roundBet,
      },
      action: {
        type: action.type,
        amount: action.amount || 0,
        chips: action.chips,
        bet: player.bet,
      }
    });
  };

  this.end = (table, players) => {
    const game = games.get(table.number);
    const map = new Map();

    players.forEach(player => {
      map.set(player.name, player);
      game.actions.push({
        table: {
          rounds: table.rounds,
          stage: table.stage,
          board: GameTable.board(table.cards).map(converter.card),
          bet: table.bet,
        },
        player: {
          name: player.name,
          chips: player.chips,
          cards: player.cards.map(converter.card),
          bet: player.roundBet,
        },
        reward: {
          chips: player.reward.chips,
          final: player.reward.final,
          changes: player.reward.changes,
        }
      });
    });

    game.actions.forEach(action => {
      if (action.table.rounds === table.rounds) {
        action.player.cards = map.get(action.player.name).cards.map(converter.card);
      }
    });
  };

  this.over = (table, player, players, winners) => {
    const game = games.get(table.number);
    game.table.rounds = table.rounds;
    game.player = { survive: player.survive, chips: player.chips };
    game.players = players.map(v => v.name);
    game.winners = winners.slice(0);
    game.datetime = new Date().getTime();
    this.list.push(game);
    games.delete(table.number);
  };
})

.controller('RootCtrl', ($scope, $window, logger, bools, game, records) => {
  $scope.logger = logger;
  $scope.tabs = bools.create('tabs', {  connect: !0, watch: !1, records: !1 }, { single: true });
  $scope.game = game;
  $scope.records = records;
  $window.game = game;

  game.rx.observable.events$.subscribe(console.log);

  game.rx.observable.table.join$.subscribe(_ => {
    const name = game.player.name;
    logger.info({
      type: 'join-table',
      messages: ['(SEND JOIN)', 'Waiting for pairing.', `Player: ${name}`],
    });
    $scope.$apply();
  });

  game.rx.observable.table.joined$.subscribe(_ => {
    records.game({ number: game.table.number });
    $scope.tabs.toggle('watch');
    logger.info({
      type: 'join-table',
      messages: ['(JOINED)'],
    });
    $scope.$apply();
  });

  game.rx.observable.game.start$.subscribe(_ => {
    const number = game.table.number;
    records.game({ number });
    $scope.tabs.toggle('watch');
    logger.info({
      type: 'game-start',
      messages: ['(Table Created)', `Table: ${number}`],
    });
    $scope.$apply();
  });

  game.rx.observable.game.over$.subscribe(_ => {
    records.over(game.table, game.player, game.players.list, game.players.winners);
    logger.info({
      type: 'game-over',
      messages: ['(GAME OVER)'],
    });
    game.players.winners.forEach(({ player, chips }) => {
      logger.info({
        type: 'game-over',
        messages: ['(WINNER)', `Player: ${player}`, `Chips: ${chips}`],
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
    records.end(game.table, game.players.list);
    logger.info({
      type: 'round-end',
      messages: ['(ROUND END)'],
    });
    game.players.list.forEach(({ name, chips, reward, hand, folded }) => {
      const changes = reward.changes > 0 ? `+${reward.changes}` : reward.changes;
      const messages = ['(HAND)', `Player: ${name}`, `Chips: ${chips} (${changes})`, `Folded: ${folded ? 'T' : 'F'}`];
      const self = name === game.player.name;
      const log = { type: 'round-end', messages, self };
      if (!hand) {
        return logger.info(log);
      }
      const cards = hand.cards.join(', ');
      messages.push(`Cards: ${cards}`, `(${hand.message})`);
      logger.info(log);
    });
    $scope.$apply();
  });

  game.rx.observable.players.action$.subscribe(data => {
    const action = new PlayerAction(data.action);
    const player = Player.format(data.players.find(v => v.playerName === action.name));
    records.action(game.table, player, action);
    logger.info({
      type: 'show-action',
      messages: ['(SHOW ACTION)', `Player: ${action.name}`, `Action: ${action.type}`, `Chips: ${action.chips}`],
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

.controller('ConnectServerCtrl', ($scope, logger, url, config, game) => {
  $scope.params = url.parser.patterns([
    { key: 'server', pattern: /server=([\w\-.:_/]+)/, match: 1 },
    { key: 'player', pattern: /name=([\w_]+)/, match: 1 },
    { key: 'rejoin', pattern: /rejoin=(yes|no)/, match: 1, format: v => v === 'yes' },
    { key: 'games', pattern: /games=(\d+)/, match: 1, format: Number },
  ]);
  $scope.options = {};
  $scope.options.server = $scope.params.server.value || config.server;
  $scope.options.player = $scope.params.player.value || config.player;
  $scope.options.rejoin = $scope.params.rejoin.exist ? $scope.params.rejoin.value : config.rejoin;
  $scope.options.games = $scope.params.games.value || config.games;
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
  $scope.reload = _ => {
    $scope.players = game.players.list.map(converter.player);
    $scope.$apply();
  };

  game.rx.observable.table.joined$.subscribe(_ => $scope.reload());
  game.rx.observable.round.start$.subscribe(_ => $scope.reload());
  game.rx.observable.round.deal$.subscribe(_ => $scope.reload());
  game.rx.observable.round.end$.subscribe(_ => $scope.reload());
  game.rx.observable.players.action$.subscribe(_ => $scope.reload());
})

.controller('RecordsCtrl', ($scope, game, records) => {
  $scope.selected = null;
  $scope.select = game => $scope.selected = game;
})

.controller('LogsToolbarCtrl', ($scope, bools, dropdowns, logger) => {
  const types = [
    'all',
    'system',
    'join-table',
    'game-start',
    'game-over',
    'round-start',
    'round-stage',
    'round-end',
    'show-action'
  ];
  $scope.filters = bools.create('filters', types, { fill: true });
  $scope.dropdowns = dropdowns.create('filters', { events: false }, { single: true });
})

.controller('LogsCtrl', ($scope, logger, bools) => {
  $scope.logs = logger.logs({ type: true });
  $scope.filters = bools.get('filters');

  logger.onflush(e => {
    $scope.logs = logger.logs().filter(log => {
      const active = $scope.filters.active(log.type);
      const all = $scope.filters.active('all');
      return all ? active : active && log.self;
    });
  });

  $scope.filters.on('change', _ => {
    $scope.logs = logger.logs().filter(log => {
      const active = $scope.filters.active(log.type);
      const all = $scope.filters.active('all');
      return all ? active : active && log.self;
    });
  });
});