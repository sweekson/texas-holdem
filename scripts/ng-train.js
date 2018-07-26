
angular.module('train', ['util'])

.factory('model', () => new PokerActionModel())

.controller('RootCtrl', ($scope, logger, model) => {
  $scope.logger = logger;

  model.on('default', _ => {
    logger.log(['[WARNING]', 'Default model is used']);
  });

  model.on('error', e => {
    logger.log(['[ERROR]', e.data.message]);
    $scope.$apply();
  });
})

.controller('TrainModelCtrl', ($scope, logger, reader, model) => {
  $scope.options = {};
  $scope.options.learningRate = .0001;
  $scope.options.epochs = 200;
  $scope.options.batchSize = 2000;
  $scope.xs = null;
  $scope.ys = null;
  $scope.fitting = false;

  model.on('fitted', () => {
    $scope.fitting = false;
    logger.log(['Finish training model']);
    $scope.$apply();
  });

  model.on('error', e => {
    $scope.fitting = false;
    $scope.$apply();
  });

  $scope.update = (target, value) => {
    $scope.options[target] = value;
  };

  $scope.select = (file, target) => {
    reader.json($scope[file], source => {
      $scope[file].loaded = true;
      $scope[file].source = source;
      $scope[target] = source;
      $scope.$apply();
    });
  };

  $scope.train = _ => {
    if (!$scope.xs || !$scope.ys) {
      return logger.log(['[WARNING]', 'Train file(s) yet selected']);
    }

    const xs = tf.tensor2d($scope.xs);
    const ys = tf.tensor2d($scope.ys);
    model.configure($scope.options);
    logger.log([
      '(Training Model)',
      `Learning rate: ${$scope.options.learningRate}`,
      `Epochs: ${$scope.options.epochs}`,
      `Batch size: ${$scope.options.batchSize}`,
    ]);
    setTimeout(_ => model.fit(xs, ys), 100);
    $scope.fitting = true;
  };

  $scope.save = _ => model.save();
})

.controller('LoadModelCtrl', ($scope, logger, model) => {
  $scope.json = null;
  $scope.weights = null;
  $scope.loading = false;

  model.on('loaded', _ => {
    logger.log(['Model loaded successfully']);
    $scope.loading = false;
    $scope.$apply();
  });

  $scope.load = _ => {
    if (!$scope.json || !$scope.weights) {
      return logger.log(['[WARNING]', 'Model file(s) yet selected']);
    }
    model.load($scope.json, $scope.weights);
    $scope.loading = true;
  }
})

.controller('PredictCtrl', ($scope, logger, reader, model) => {
  $scope.xs = null;
  $scope.actions = ['call', 'raise', 'bet', 'check', 'fold', 'allin'];

  model.on('output', e => {
    const action = $scope.actions[e.data];
    logger.log([`Predict action: ${action}`]);
  });

  $scope.select = _ => {
    reader.json($scope.inputs, source => {
      $scope.inputs.loaded = true;
      $scope.inputs.source = source;
      $scope.xs = source;
      $scope.$apply();
    });
  };

  $scope.input = _ => {
    const inputs = $scope.text.match(/\d+/g).map(Number);
    $scope.xs = [inputs];
  };

  $scope.predict = _ => {
    if (!$scope.xs || !$scope.xs.length) {
      return logger.log(['[WARNING]', 'Empty inputs']);
    }
    logger.log([`Inputs: ${$scope.xs.join(', ')}`]);
    model.predict(tf.tensor2d($scope.xs));
  };
})

.controller('LogsCtrl', ($scope, logger) => {
  $scope.logs = logger.logs({ type: true });
  logger.onflush(e => $scope.logs = logger.logs({ type: true }));
});