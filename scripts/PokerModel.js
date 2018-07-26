
class MachineLearningModel extends EventTarget {
  constructor(options) {
    super();
    this.defaults = {
      learningRate: 0.001,
      epochs: 100,
      batchSize: 32,
      shuffle: true
    };
    this.options = Object.assign({}, this.defaults, options);
    this.callbacks  = {
      onEpochEnd: (epoch, log) => console.log(`Epoch ${epoch}: loss = ${log.loss}`)
    };
    this.fitted = false;
    this.loaded = false;
    this.prepare();
    this.init();
  }

  /**
   * Prepare model structure and optimizer
   */
  prepare() {}

  init() {
    this.emit('inited');
  }

  configure(options) {
    this.options = Object.assign({}, this.defaults, options);
    this.prepare();
    this.init();
  }

  fit(xs, ys) {
    this.model.fit(xs, ys, {
      epochs: this.options.epochs,
      batchSize: this.options.batchSize,
      shuffle: this.options.shuffle
    })
    .then(() => {
      this.emit('fitted');
      this.fitted = true;
    })
    .catch(error => {
      this.emit('error', error);
      console.error(error);
    });
  }

  predict(xs) {
    if (!this.fitted && !this.loaded) {
      this.emit('default');
    }
    const max = this.model.predict(xs).as1D().argMax().dataSync()[0];
    this.emit('output', max);
  }

  load(json, weights) {
    tf.loadModel(tf.io.browserFiles([json, weights])).then(v => {
      this.model = v;
      this.loaded = true;
      this.emit('loaded');
    });
  }

  save(file) {
    if (!this.fitted && !this.loaded) {
      this.emit('default');
    }
    const filename = file || 'model';
    this.model.save(`downloads://${filename}`);
  }

  summary() {
    this.model.summary();
  }

  on(type, callback) {
    this.addEventListener(type, callback);
  }

  emit(type, data) {
    const event = new Event(type);
    event.data = data;
    this.dispatchEvent(event);
  }
}

class PokerActionModel extends MachineLearningModel {
  constructor(options) {
    super(Object.assign({
      learningRate: 0.0001,
      epochs: 200,
      batchSize: 2000,
      shuffle: true
    }, options));
  }

  prepare() {
    const matches = location.search.match(/shape=(\d+)/);
    const shape = matches ? Number(matches[1]) : 9;

    this.model = tf.sequential({
      layers: [
        tf.layers.dense({ units: 50, inputShape: shape }),
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dense({ units: 6, activation: 'softmax' })
      ]
    });

    this.optimizer = tf.train.adam(this.options.learningRate);
  }

  init() {
    this.model.compile({
      loss: 'categoricalCrossentropy',
      optimizer: this.optimizer,
      metrics: ['accuracy']
    });
    this.emit('inited');
  }
}

class PokerBetModel extends MachineLearningModel {
  constructor(options) {
    super(Object.assign({
      learningRate: 0.0001,
      epochs: 200,
      batchSize: 2000,
      shuffle: true
    }, options));
  }

  prepare() {
    this.model = tf.sequential({
      layers: [
        tf.layers.dense({ units: 50, inputShape: 8 }),
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dense({ units: 50, activation: 'relu' }),
        tf.layers.dense({ units: 1, activation: 'softmax' })
      ]
    });
    this.optimizer = tf.train.adam(this.options.learningRate);
  }

  init() {
    this.model.compile({
      loss: 'categoricalCrossentropy',
      optimizer: this.optimizer,
      metrics: ['accuracy']
    });
    this.emit('inited');
  }
}