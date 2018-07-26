
class Poker {
  constructor(cards) {
    this.cards = cards;
  }

  get indexes () {
    return this.cards.map(card => Poker.cards.indexOf(card));
  }
}

Poker.stages = ['Deal', 'Flop', 'Turn', 'River'];
Poker.numbers = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
Poker.symbols = ['S', 'H', 'D', 'C'];
Poker.actions = ['call', 'raise', 'bet', 'check', 'fold', 'allin'];
Poker.cards = Poker.numbers.reduce((a, n) => a.concat(Poker.symbols.map(s => n + s)), []);