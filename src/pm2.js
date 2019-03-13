const io = require('@pm2/io');

const iterationsCounter = io.counter({
  name: 'Total Iterations'
});

const iterationDurationMetric = io.metric({
  name: 'Mean Iteration Duration',
  unit: 's',
  type: 'histogram',
  measurement: 'mean'
});

module.exports = {
  iterationsCounter, iterationDurationMetric
};
