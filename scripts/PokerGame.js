
class Bot {
  constructor() {
    const Subject = rxjs.Subject;

    this.answer = new Subject();
    this.answer$ = this.answer.asObservable();
  }

  init(game) {}

  respond(data) {
    this.answer.next(data);
  }

  react(game) {}

  get isModelBot() {
    return this instanceof ModelBot;
  }
}

class PokerBaseBot extends Bot {
  constructor() {
    super();
    this.status = 0;
    this.actions = {};
  }

  init(game) {
    game.rx.observable.players.action$.subscribe(data => {
      var action = new PlayerAction(data.action);
      var table = data.table;

      if (!this.actions[action.name]) {
        this.actions[action.name] = [];
      }

      var currentPlayer = this.actions[action.name];
      currentPlayer.push(action.type);

      if (table.roundName === 'Flop' &&
        (action.type === 'raise' || action.type === 'allin' || action.type === 'bet') &&
        currentPlayer.toString().indexOf('raise') === -1) {
        this.status = PokerBaseBot.statuses.risk;
      }

      if (table.roundName === 'Turn' &&
        (action.type === 'raise' || action.type === 'allin' || action.type === 'bet') &&
        currentPlayer.toString().indexOf('raise') === -1) {
        this.status = PokerBaseBot.statuses.danger;
      }
    });

    game.rx.observable.round.start$.subscribe(_ => {
      this.actions = {};
      this.status = 0;
    });
  }

  react(game) {
    const selfCards = game.self.cards;
    const allCards = game.self.cards.concat(game.table.cards).filter(v => v);

    if (allCards.length === 2) {
      return this.respond({ action: 'call' });
    }

    var handRanks = [];
    var handSuits = [];
    var isTonghua = false;
    var isShunzi = false;
    var isSitiao = false;
    var isSantiao = false;
    var pairNumber = 0;
    var pairValue = '';
    var maxPairValue = '0';

    var temp = 1;

    var i = 0;
    for (i = 0; i < allCards.length; i++) {
        handRanks[i] = allCards[i].substr(0, 1);
        handSuits[i] = allCards[i].substr(1, 2);
    }

    for (i = 0; i < selfCards.length; i++)
      selfCards[i] = selfCards[i].substr(0, 1);

    handRanks = handRanks.sort().toString().replace(/\W/g, '');
    handSuits = handSuits.sort().toString().replace(/\W/g, '');

    for (i = 1; i < handRanks.length; i++) {
      if (handRanks[i].charCodeAt(0) - handRanks[i - 1].charCodeAt(0) === 1) {
        temp++;
        if (temp === 5)
          isShunzi = true;
      } else {
        temp = 1;
      }
    }

    temp = 1;
    for (i = 1; i < handRanks.length; i++) {
      if (handRanks[i] === handRanks[i - 1]) {
        temp++;
        if (temp === 4)
          isSitiao = true;
        else if (temp === 3)
          isSantiao = true;
        else if (temp === 2) {
          pairNumber++;
          pairValue += handRanks[i];
          if (handRanks[i] === 'A' && maxPairValue === '0')
            maxPairValue = '1';
          else if (handRanks[i] === 'T' && maxPairValue < 'I')
            maxPairValue = 'I';
          else if (handRanks[i] > maxPairValue)
            maxPairValue = handRanks[i];
        }
      } else {
        temp = 1;
      }
    }

    temp = 1;
    for (i = 1; i < handSuits.length; i++) {
      if (handSuits[i] === handSuits[i - 1]) {
          temp++;
          if (temp === 5) {
              isTonghua = true;
          }
      }
      else
        temp = 1;
    }

    if (isTonghua || isShunzi) {
      if (handRanks.indexOf('T') > -1 && handRanks.indexOf('J') > -1 && handRanks.indexOf('Q') > -1 && handRanks.indexOf('K') > -1 && handRanks.indexOf('A') > -1)
        this.respond({ action: 'raise' });
      else if (isTonghua && isShunzi)
        this.respond({ action: 'allin' });
      else if (this.status !== PokerBaseBot.statuses.danger)
        this.respond({ action: 'raise' });
      else
        this.respond({ action: 'call' });
      return;
    }

    if (isSitiao) {
      if (this.status !== PokerBaseBot.statuses.danger)
        this.respond({ action: 'raise' });
      else
        this.respond({ action: 'call' });
      return;
    }

    var winprob = game.self.minBet / game.table.bet;

    if (isSantiao || pairNumber > 1) {
      if (isSantiao && (pairNumber > 1 || maxPairValue > '9') && this.status !== PokerBaseBot.statuses.danger)
        this.respond({ action: 'raise' });
      else if (this.status === PokerBaseBot.statuses.danger && !isSantiao && !(pairValue.indexOf(selfCards[0]) > -1 && pairValue.indexOf(selfCards[1]) > -1 && selfCards[0] !== selfCards[1]) && maxPairValue < 'I')
        this.respond({ action: 'fold' });
      else if (winprob < .7)
        this.respond({ action: 'call' });
      else
        this.respond({ action: 'fold' });
      return;
    }

    // One Pair
    if (pairNumber > 0 && (pairValue.toString().indexOf(selfCards[0]) > -1 || pairValue.toString().indexOf(selfCards[1]) > -1)) {
      if ((this.status === PokerBaseBot.statuses.risk && maxPairValue < '8') || (this.status === PokerBaseBot.statuses.danger && maxPairValue < 'J'))
        this.respond({ action: 'fold' });
      else if (winprob < .5)
        this.respond({ action: 'call' });
      else
        this.respond({ action: 'fold' });
      return;
    }

    if (allCards.length > 5)
      this.respond({ action: 'fold' });
    else if (game.self.minBet < game.self.chips * .4)
      this.respond({ action: 'call' });
    else
      this.respond({ action: 'fold' });
  }
}

window.PokerBaseBot = PokerBaseBot;

PokerBaseBot.statuses = {
  risk: 1,
  danger: 2
};

class ModelBot extends Bot {
  constructor() {
    super();
    this.model = null;
  }

  load(model) {
    this.model = model;

    this.model.on('output', e => {
      const action = Poker.actions[e.data];
      this.respond({ action });
    });
  }
}

class PokerModelBotV1 extends ModelBot {
  react(game) {
    const stage = game.table.stage;
    this[`on${stage}`](game);
  }

  predict(game) {
    const { table, players, player } = game;
    const cards = player.cards.concat(table.cards).filter(v => v);
    const analysis = new Evaluator().describe(cards);
    const hand = new PokerHand(analysis.best.join(' '));
    const score = hand.score;
    const xs = [[players.list.length, score, player.chips]];
    this.model.predict(tf.tensor2d(xs));
  }

  onDeal(game) {
    const minBet = game.player.minBet;
    const cards = game.player.cards;
    const rate = Pokereval.rate(...cards);

    if (rate < .6 && minBet > 500) { return this.respond({ action: 'fold' }); }
    if (minBet > 800) { return this.respond({ action: 'fold' }); }
    if (rate > .9) { return this.respond({ action: 'bet', amount: 50 }); }
    this.respond({ action: 'call' });
  }

  onFlop(game) { this.predict(game); }
  onTurn(game) { this.predict(game); }
  onRiver(game) { this.predict(game); }
}

window.PokerModelBotV1 = PokerModelBotV1;

class PlayerChipsReward {
  constructor(chips) {
    this.chips = chips;
    this.final = chips;
    this.changes = 0;
  }

  refresh(chips) {
    this.chips = chips;
    this.final = chips;
  }

  resolve(final) {
    this.final = final;
    this.changes = final - this.chips;
  }
}

class AnonymousPlayer {
  constructor(data) {
    this.assign(data);
    this.reward = new PlayerChipsReward(this.chips);
    this.wins = 0;
  }

  assign(data) {
    Object.assign(this, Player.format(data));
  }
}

AnonymousPlayer.create = data => new AnonymousPlayer(data);

class Player extends AnonymousPlayer {
  constructor(id) {
    super({ playerName: md5(id) });
    this.id = id;
    this.cards = [0, 0];
    this.self = true;
  }
}

Player.format = data => {
  const name = data.playerName;
  const chips = data.chips;
  const bet = data.bet;
  const roundBet = data.roundBet;
  const minBet = data.minBet;
  const hand = data.hand;
  const cards = Player.cards(data.cards);
  const folded = data.folded;
  const allin = data.allIn;
  const online = data.isOnline;
  const survive = data.isSurvive;
  const human = data.isHuman;
  return { name, chips, bet, roundBet, minBet, hand, cards, folded, allin, online, survive, human };
};

Player.cards = cards => {
  return !cards || !cards.length ? [0, 0] : cards;
};

class Players {
  constructor(self) {
    this.list = [];
    this.map = new Map();
    this.self = self;
    this.wins = new Map();
    this.winners = [];
  }

  /**
   * To assign player list while joined a game table or started a new round
   * @param {Array} list
   */
  assign(list) {
    this.list = list.map(AnonymousPlayer.create);
    Object.assign(this.self, this.list.find(v => v.name === this.self.name));
    this.list.splice(this.list.findIndex(v => v.name === this.self.name), 1, this.self);
    this.list.forEach(player => {
      this.map.set(player.name, player);
      this.wins.set(player.name, this.wins.get(player.name) || 0);
      player.reward.refresh(player.chips + player.bet);
      player.wins = this.wins.get(player.name);
    });
  }

  /**
   * To refresh player list while during a round
   * @param {Array} list
   */
  refresh(list) {
    const table = new Map();
    list.forEach(data => table.set(data.playerName, data));
    this.list.forEach(player => player.assign(table.get(player.name)));
  }

  /**
   * To resolve player list while ended a round
   * @param {Array} list
   */
  resolve(list) {
    const table = new Map();
    list.forEach(data => table.set(data.playerName, data));
    this.list.forEach(player => {
      player.reward.resolve(player.chips);
      player.reward.changes > 0 && this.wins.set(player.name, this.wins.get(player.name) + 1);
      player.wins = this.wins.get(player.name);
    });
  }

  set(name, data) {
    const player = this.map.get(name);
    this.map.set(name, Object.assign(player, data));
  }

  update(name, prop, value) {
    this.map.get(name)[prop] = value;
  }
}

class PlayerWinner {
  constructor(data) {
    this.player = data.playerName;
    this.chips = data.chips;
    this.hand = data.hand;
  }
}

class GameTable {
  constructor(number) {
    this.number = number || 0;
    this.rounds = -1;
    this.stage = '-';
    this.cards = [0, 0, 0, 0, 0];
    this.bet = 0;
    this.sb = null;
    this.bb = null;
    this.ready = false;
  }

  assign(data) {
    Object.assign(this, GameTable.format(data));
    this.ready = true;
  }

  board(board) {
    this.cards = GameTable.board(board);
  }
}

GameTable.board = cards => {
  const defaults = [0, 0, 0, 0, 0];
  if (!cards || !cards.length) { return defaults; }
  defaults.splice.call(defaults, 0, cards.length, ...cards);
  return defaults;
};

GameTable.format = data => {
  const number = data.tableNumber;
  const rounds = data.roundCount;
  const stage = data.roundName;
  const cards = GameTable.board(data.board);
  const bet = data.totalBet;
  const sb = BlindBet.format(data.smallBlind);
  const bb = BlindBet.format(data.bigBlind);
  return { number, rounds, stage, cards, bet, sb, bb };
};

class BlindBet {}

BlindBet.format = data => {
  const player = data.playerName;
  const amount = data.amount;
  return { player, amount };
};

class PlayerAction {
  constructor(data) {
    this.name = data.playerName;
    this.type = data.action;
    data.amount && (this.amount = data.amount);
    this.chips = data.chips;
    this.self = data.self;
  }
}

class PokerGame extends EventTarget {
  constructor(options) {
    super();
    const Subject = rxjs.Subject;
    const filter = rxjs.operators.filter;
    const map = rxjs.operators.map;

    this.defaults = { rejoin: true, bet: 0, games: 1 };
    this.options = Object.assign({}, this.defaults, options);
    this.server = this.options.server;
    this.socket = null;
    this.table = new GameTable();
    this.player = new Player(this.options.player);
    this.players = new Players(this.player);
    this.bot = this.options.bot;
    this.games = 0;
    this.connected = false;

    this.rx = {};

    this.rx.subject = {
      events: new Subject(),
      actions: new Subject(),
    };

    this.rx.observable = {
      events$: this.rx.subject.events.asObservable(),
      actions$: this.rx.subject.actions.asObservable(),
    };

    this.rx.observable.socket = {
      connected$: this.rx.observable.events$.pipe(
        filter(v => v.type === PokerGame.events.connected)
      ),
      disconnected$: this.rx.observable.events$.pipe(
        filter(v => v.type === PokerGame.events.disconnected)
      ),
    };

    this.rx.observable.messages$ = this.rx.observable.events$.pipe(
      filter(v => v.type === PokerGame.events.message),
      filter(v => v.data.eventName),
      map(v => ({ type: v.data.eventName, data: v.data.data }))
    );

    this.rx.observable.table = {
      join$: this.rx.observable.actions$.pipe(
        filter(v => v.action === PokerGame.actions.join),
        map(v => v.data)
      ),
      joined$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.join),
        map(v => v.data)
      )
    };

    this.rx.observable.game = {
      start$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.game_start && v.data.error_code === 0),
        map(v => v.data)
      ),
      over$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.game_over),
        map(v => v.data)
      )
    };

    this.rx.observable.round = {
      start$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.new_round),
        map(v => v.data)
      ),
      deal$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.deal),
        map(v => v.data)
      ),
      reload$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.start_reload),
        map(v => v.data)
      ),
      end$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.round_end),
        map(v => v.data)
      )
    };

    this.rx.observable.player = {
      action$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.action),
        map(v => v.data)
      ),
      bet$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.bet),
        map(v => v.data)
      )
    };

    this.rx.observable.players = {
      action$: this.rx.observable.messages$.pipe(
        filter(v => v.type === PokerGame.messages.show_action),
        map(v => v.data)
      ),
    };

    this.init();
  }

  init() {
    const observable = this.rx.observable;
    const bot = this.bot;

    observable.socket.connected$.subscribe(_ => setTimeout(_ => this.join(), 50));
    observable.socket.disconnected$.subscribe(_ => this.connected = false);
    observable.round.reload$.subscribe(_ => this.reload());
    observable.messages$.subscribe(data => this.refresh(data.type, data.data));

    bot.init(this);
    bot.answer$.subscribe(data => this[data.action](data));
  }

  configure(options) {
    this.options = Object.assign({}, this.defaults, options);
    this.server = this.options.server || thie.server;
    this.player = this.options.player ? new Player(this.options.player) : this.player;
    this.players = new Players(this.player);
    this.bot = this.options.bot || this.bot;
  }

  refresh(event, data) {
    const { options, table, players, player } = this;

    switch (event) {
      case PokerGame.messages.game_start:
        this.table = new GameTable(data.tableNumber);
        this.player = new Player(this.options.player);
        this.players = new Players(this.player);
        break;

      case PokerGame.messages.new_round:
      case PokerGame.messages.join:
        table.assign(data.table);
        players.assign(data.players);
        break;

      case PokerGame.messages.deal:
        table.assign(data.table);
        players.refresh(data.players);
          break;

      case PokerGame.messages.round_end:
        table.assign(data.table);
        players.refresh(data.players);
        players.resolve(data.players);
          break;

      case PokerGame.messages.game_over:
        ++this.games;
        players.refresh(data.players);
        players.winners = data.winners.map(data => new PlayerWinner(data));
        options.rejoin && this.games < options.games ? this.join() : this.disconnect();
          break;

      case PokerGame.messages.action:
      case PokerGame.messages.bet:
        table.board(data.game.board);
        player.assign(data.self);
        this.bot.react(Object.assign({}, this, { self: player }));

          break;
      default:
        break;
    }
  }

  bet(data) {
    const data = { action: 'bet', amount: data.amount || this.options.bet };
    this.send(PokerGame.actions.action, data);
  }

  call() {
    const data = { action: 'call' };
    this.send(PokerGame.actions.action, data);
  }

  check() {
    const data = { action: 'check' };
    this.send(PokerGame.actions.action, data);
  }

  raise() {
    const data = { action: 'raise' };
    this.send(PokerGame.actions.action, data);
  }

  allin() {
    const data = { action: 'allin' };
    this.send(PokerGame.actions.action, data);
  }

  fold() {
    const data = { action: 'fold' };
    this.send(PokerGame.actions.action, data);
  }

  reload() {
    this.send(PokerGame.actions.reload);
  }

  join() {
    const data = { playerName: this.player.id };
    this.connected = true;
    this.send(PokerGame.actions.join, data);
  }

  send(action, data) {
    this.rx.subject.actions.next({ action: action, data: data });
    this.socket.send(
      JSON.stringify({
        eventName: action,
        data: data
      })
    );
    return this;
  }

  connect() {
    const subject = this.rx.subject;
    this.socket = new WebSocket(this.server);
    this.socket.onopen = event => subject.events.next({ type: PokerGame.events.connected });
    this.socket.onclose = event => subject.events.next({ type: PokerGame.events.disconnected, event });
    this.socket.onmessage = event => subject.events.next({
      type: PokerGame.events.message,
      data: JSON.parse(event.data)
    });
    this.socket.onerror = event => subject.events.next({ type: PokerGame.events.error, event });
    return this;
  }

  disconnect() {
    this.socket.close();
    return this;
  }

  on(type, callback) {
    this.addEventListener(type, callback);
    return this;
  }

  emit(type, data) {
    const event = new Event(type);
    event.data = data;
    this.dispatchEvent(event);
    return this;
  }
}

PokerGame.events = {
  connected: 'connected',
  disconnected: 'disconnected',
  message: 'message',
  error: 'error',
};

PokerGame.actions = {
  join: '__join',
  action: '__action',
  reload: '__reload',
};

PokerGame.messages = {
  action: '__action',
  bet: '__bet',
  show_action: '__show_action',
  new_round: '__new_round',
  deal: '__deal',
  start_reload: '__start_reload',
  round_end: '__round_end',
  join: '_join',
  game_start: '__game_start',
  game_over: '__game_over',
};