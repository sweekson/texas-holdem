;(function (root, factory) {

  if (typeof define === 'function' && define.amd) {
      // AMD
      define(factory);
  } else if (typeof exports === 'object') {
      // Node, CommonJS-like
      module.exports = factory();
  } else {
      // Browser globals (root is window)
      root.Evaluator = factory();
  }

}(this, () => {
  /**
   * ------------------------------------------------------------------------
   * Constants
   * ------------------------------------------------------------------------
   */
  const VERSION = '0.1.1';

  // Base Score
  const SCORE = { '2': 1,  '3': 2,  '4': 3, '5': 4,  '6': 5,  '7': 6, '8': 7,  '9': 8,  'T': 9, 'J': 10, 'Q': 11, 'K': 12, 'A': 13 };

  // Four Suite: H: ♥ Hearts, C: ♣ Clubs, S: ♠ Spades, D: ♦ Diamonds
  const SUITS = 'H|C|S|D';

  // Patterns for straight
  const STRAIGHT_PATTERNS = ['A|2|3|4|5', '2|3|4|5|6', '3|4|5|6|7', '4|5|6|7|8', '5|6|7|8|9', '6|7|8|9|T', '7|8|9|T|J', '8|9|T|J|Q', '9|T|J|Q|K', 'T|J|Q|K|A'];

  // Utilities
  const uniq = (a) => a.sort().filter((item, pos, ary) => (!pos || item != ary[pos - 1]));

  const explore = (curDim, prefix, dimensions, results) => {
    let nextDim = dimensions.shift();
    for (var i = 0; i < curDim.length; i++) {
        if (nextDim) explore(nextDim, prefix + curDim[i] + "/", dimensions, results);
        else results.push(prefix + curDim[i]);
    }
    if (nextDim) dimensions.push(nextDim);
  }

  // Private methods
  const countsOfAKind = function (ranks) {
      let four = [], three = [], two = [], count = {};
      ranks.forEach(function(i) {
        count[i] = (count[i] || 0) + 1;
        count[i] == 2 ? two.push(i) : count[i] == 3 ? three.push(i) : count[i] == 4 ? four.push(i) : null;
      });
      return { two, three, four };
  };
  /**
  * ------------------------------------------------------------------------
  * Class Definition
  * ------------------------------------------------------------------------
  */
  class Evaluator {

    constructor() {

    }

    // Getters
    static get VERSION() {
        return VERSION;
    }

    // Multiply score for each hand value
    static get MULT () {
      return {
        ROYAL_FLUSH: 9,
        STRAIGHT_FLUSH: 8,
        FOUR_OF_A_KIND: 7,
        FULL_HOUSE: 6,
        FLUSH: 5,
        STRAIGHT: 4,
        THREE_OF_A_KIND: 3,
        TWO_PAIRS: 2,
        PAIR: 1,
        HIGHEST_CARD: 0
      }
    }

    // Public
    royalFlush (handCards, bestFive) {
      let _straightFlush = this.straightFlush(handCards, bestFive);
      if (_straightFlush === 'A') return _straightFlush;
      return undefined;
    }

    straightFlush (handCards, bestFive) {
      let straights = this.straights(handCards);
      let straightFlushs = [];
      let score = {};
      if (!straights) return undefined;
      straights.forEach(straight => {
        let matchCards = {};
        let results = [];
        straight.split('').forEach(sCard => {
          handCards.forEach(card => {
            let matched = card.match(new RegExp(`${sCard}(${SUITS})`));
            if (matched) {
              if (!matchCards[sCard]) matchCards[sCard] = [];
              matchCards[sCard].push(matched[1]);
            }
          });
        });
        let dimensions = Object.keys(matchCards).map(key => matchCards[key]);
        explore(dimensions.shift(), "", dimensions, results);
        results.forEach(result => {
          if (uniq(result.split('/')).length === 1) straightFlushs.push(straight);
        });
      });
      if (straightFlushs.length > 0) {
        straightFlushs = straightFlushs.pop();
        bestFive.push(
          ...straightFlushs.split('').map(stCard => {
            for(let card of handCards) {
              if (card.match(stCard)) return card;
            }
          })
        );
        return straightFlushs[4];
      }
      return undefined;
    }

    fourOfAKind (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]);
      let catched = countsOfAKind(ranks);
      if (catched.four.length === 1) {
        bestFive.push(
          ...handCards
            .filter((card) => {
              if (card.match(new RegExp(catched.four[0]))) {
                bestFive.push(card);
                return false;
              } else {
                return true;
              }
            })
            .sort((a, b) => SCORE[a[0]] - SCORE[b[0]])
            .slice(-1)
        );
        return catched.four[0];
      }
      else undefined;
    }

    fullHouse (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]);
      let catched = countsOfAKind(ranks);
      let _fullHOuse = undefined;
      let _twos;
      if (catched.three.length > 0 && catched.two.length > 1) {
        _fullHOuse = catched.three.sort((a, b) => SCORE[a] - SCORE[b]).pop();
        _twos = catched.two.filter(card => card != _fullHOuse).sort((a, b) => SCORE[a] - SCORE[b]).pop();
        handCards
          .filter((card) => {
            if (card.match(new RegExp(_fullHOuse))) {
              bestFive.push(card);
              return false;
            } else {
              return true;
            }
          })
          .forEach((card) => {
            if (card.match(new RegExp(_twos))) {
              bestFive.push(card);
            }
          });
        return _fullHOuse;
      }
      return undefined;
    };

    flush (handCards, bestFive) {
      let suits = handCards.map(card => card[1]);
      let count = {};
      let matched = undefined;
      let flush = uniq(suits.filter(function(i) {
        count[i] = (count[i] || 0) + 1;
        return count[i] >= 5;
      }));
      if (flush.length === 1) {
        matched = handCards.join('').match(new RegExp('([A-Z0-9])?' + flush[0], 'g')).sort((a, b) => SCORE[a[0]] - SCORE[b[0]]);
        bestFive.push(...matched.slice(-5));
        return matched.pop()[0];
      }
      return undefined;
    }

    straight (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]);
      let cards = uniq(ranks).join('&');
      let results = STRAIGHT_PATTERNS
          .filter(pattern => {
            let matched = cards.match(new RegExp(pattern, 'g'));
            return matched && matched.length === 5 ? true : false;
          })
          .map(straight => straight.replace(/\|/g, ''));
      if (results.length > 0) {
        let _straight = results.pop();
        bestFive.push(
          ..._straight.split('').map(stCard => {
            for(let card of handCards) {
              if (card.match(stCard)) return card;
            }
          })
        );
        return _straight[4];
      }
      return undefined;
    }

    straights (handCards) {
      let ranks = handCards.map(card => card[0]);
      let cards = uniq(ranks).join('&');
      let results = STRAIGHT_PATTERNS
          .filter(pattern => {
            let matched = cards.match(new RegExp(pattern, 'g'));
            return matched && matched.length === 5 ? true : false;
          })
          .map(straight => straight.replace(/\|/g, ''));
      if (results.length > 0) return results;
      return undefined;
    }

    threeOfAKind (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]);
      let catched = countsOfAKind(ranks);
      if (catched.three.length === 1 && catched.two.length === 1) {
        bestFive.push(
          ...handCards
            .filter((card) => {
              if (card.match(new RegExp(catched.three[0]))) {
                bestFive.push(card);
                return false;
              } else {
                return true;
              }
            })
            .sort((a, b) => SCORE[a[0]] - SCORE[b[0]])
            .slice(-2)
        );
        return catched.three[0];
      }
      return undefined;
    }

    twoPairs (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]);
      let catched = countsOfAKind(ranks);
      if (catched.two.length >= 2) {
        let _twoPairs = catched.two.sort((a, b) => SCORE[a] - SCORE[b]).slice(-2).sort((a, b) => SCORE[b] - SCORE[a]);
        bestFive.push(
          ...handCards
            .filter((card) => {
              let keep = true;
              for (let pair of _twoPairs) {
                if (card.match(new RegExp(pair))) {
                  bestFive.push(card);
                  keep = false;
                }
              }
              return keep;
            })
            .sort((a, b) => SCORE[a[0]] - SCORE[b[0]])
            .slice(-1)
        );
        return _twoPairs;
      }
      return undefined;
    }

    pair (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]);
      let catched = countsOfAKind(ranks);
      if (catched.two.length == 1 && catched.three.length == 0) {
        bestFive.push(
          ...handCards
            .filter((card) => {
              if (card.match(new RegExp(catched.two[0]))) {
                bestFive.push(card);
                return false;
              }
              return true;
            })
            .sort((a, b) => SCORE[a[0]] - SCORE[b[0]])
            .slice(-3)
        );
        return catched.two[0];
      }
      return undefined;
    }

    highestCard (handCards, bestFive) {
      let ranks = handCards.map(card => card[0]).sort((a, b) => SCORE[a] - SCORE[b])
      bestFive.push(...ranks.slice(-5));
      return ranks.pop();
    }

    score (card, times) {
        if (card) {
          if (typeof card === 'string') return SCORE[card] + (Object.keys(SCORE).length * times);
          if (typeof card === 'object') return SCORE[card.shift()] + (Object.keys(SCORE).length * times);
        }
        return 0;
    }

    describe (handCards) {
      let scores = [];
      Object.keys(Evaluator.MULT).forEach((rankType) => {
        let checkRankFn = rankType.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join('').replace(/^[a-zA-Z]/i, (f) => f.toLowerCase());
        let bestFive = [];
        let rankValue = this[checkRankFn](handCards, bestFive);
        scores.push({
          best: bestFive.sort((a, b) => SCORE[a[0]] - SCORE[b[0]]),
          hand: handCards,
          rank: rankType,
          rankValue: `${rankValue} ${rankType}`,
          score: this.score(rankValue, Evaluator.MULT[rankType])
        });

      });
      return scores.sort((a, b) => a.score - b.score).pop();
    }

  }
  return Evaluator;
}));